import { ReactNode, useMemo, useState, CSSProperties, useCallback, useEffect } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import {
  ConversationBotMessage,
  TableMessageTemplate,
  TableColumn,
  TableColumnFormat,
  TableRowType,
} from '@asgard-js/core';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from '../text-template/streamdown-client';
import clsx from 'clsx';
import classes from './table-template.module.scss';

interface TableTemplateProps {
  message: ConversationBotMessage;
}

type TableTab = 'table' | 'sql';

type DownloadFormat = 'csv' | 'jsonl';

interface SnackbarState {
  visible: boolean;
  fileName: string;
  blobUrl: string | null;
}

function formatCellValue(value: unknown, format?: TableColumnFormat): string {
  if (value == null) return '';

  switch (format) {
    case 'DATE':
      return new Date(value as string).toLocaleDateString();
    case 'DATE_TIME':
      return new Date(value as string).toLocaleString();
    case 'CURRENCY':
      return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
      }).format(value as number);
    default:
      return String(value);
  }
}

function getCellValue(
  row: Record<string, unknown> | unknown[],
  column: TableColumn,
  columnIndex: number,
  rowType: TableRowType,
): unknown {
  if (rowType === 'ARRAY') {
    return (row as unknown[])[columnIndex];
  }

  return (row as Record<string, unknown>)[column.key ?? ''];
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function convertToCsv(
  columns: TableColumn[],
  data: Record<string, unknown>[] | unknown[][],
  rowType: TableRowType,
): string {
  const headers = columns.map(col => escapeCsvValue(col.header)).join(',');

  const rows = data.map(row => {
    return columns
      .map((column, colIndex) => {
        const rawValue = getCellValue(row, column, colIndex, rowType);
        const formattedValue = formatCellValue(rawValue, column.format);

        return escapeCsvValue(formattedValue);
      })
      .join(',');
  });

  return [headers, ...rows].join('\n');
}

function convertToJsonLines(
  columns: TableColumn[],
  data: Record<string, unknown>[] | unknown[][],
  rowType: TableRowType,
): string {
  return data
    .map(row => {
      const obj: Record<string, unknown> = {};

      columns.forEach((column, colIndex) => {
        const key = column.key ?? column.header;

        obj[key] = getCellValue(row, column, colIndex, rowType);
      });

      return JSON.stringify(obj);
    })
    .join('\n');
}

function getPageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push('ellipsis');

  for (let page = start; page <= end; page++) {
    items.push(page);
  }

  if (end < total - 1) items.push('ellipsis');

  items.push(total);

  return items;
}

function DownloadIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function TableTemplate(props: TableTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as TableMessageTemplate;
  const { table, title } = template;
  const { columns, data, pagination, rowType, sql, sqlExplanation } = table;

  const hasSql = Boolean(sql || sqlExplanation);

  const { template: themeTemplate, botMessage } = useAsgardThemeContext();

  const [activeTab, setActiveTab] = useState<TableTab>('table');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    fileName: '',
    blobUrl: null,
  });

  const pageSize = pagination?.size ?? data.length;
  const totalPages = Math.ceil(data.length / pageSize);

  const paginatedData = useMemo(() => {
    if (!pagination) return data;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    return data.slice(startIndex, endIndex);
  }, [data, pagination, currentPage, pageSize]);

  const styles = useMemo<CSSProperties>(
    () => ({
      color: botMessage?.color,
      backgroundColor: botMessage?.backgroundColor,
    }),
    [botMessage],
  );

  const handlePrevPage = (): void => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = (): void => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const handleDownload = useCallback(
    (format: DownloadFormat): void => {
      const content =
        format === 'jsonl'
          ? convertToJsonLines(columns, data, rowType)
          : `\uFEFF${convertToCsv(columns, data, rowType)}`;
      const mimeType = format === 'jsonl' ? 'application/x-ndjson;charset=utf-8;' : 'text/csv;charset=utf-8;';
      const blob = new Blob([content], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTitle = (title || 'table').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
      const fileName = `${safeTitle}_${timestamp}.${format}`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadMenuOpen(false);
      setSnackbar({ visible: true, fileName, blobUrl });
    },
    [columns, data, rowType, title],
  );

  const handleOpenFile = useCallback((): void => {
    if (snackbar.blobUrl) {
      window.open(snackbar.blobUrl, '_blank');
    }
  }, [snackbar.blobUrl]);

  const handleCloseSnackbar = useCallback((): void => {
    if (snackbar.blobUrl) {
      URL.revokeObjectURL(snackbar.blobUrl);
    }

    setSnackbar({ visible: false, fileName: '', blobUrl: null });
  }, [snackbar.blobUrl]);

  useEffect(() => {
    if (snackbar.visible) {
      const timer = setTimeout(() => {
        handleCloseSnackbar();
      }, 5000);

      return (): void => clearTimeout(timer);
    }

    return;
  }, [snackbar.visible, handleCloseSnackbar]);

  return (
    <TemplateBox
      className="asgard-table-template"
      type="bot"
      direction="vertical"
      style={themeTemplate?.TableMessageTemplate?.style}
    >
      <TemplateBoxContent quickReplies={template?.quickReplies}>
        <div className={classes.container} style={styles}>
          {hasSql && (
            <div className={classes.tabs} role="tablist">
              <button
                className={clsx(classes.tab, activeTab === 'table' && classes['tab--active'])}
                role="tab"
                aria-selected={activeTab === 'table'}
                onClick={() => setActiveTab('table')}
              >
                Table
              </button>
              <button
                className={clsx(classes.tab, activeTab === 'sql' && classes['tab--active'])}
                role="tab"
                aria-selected={activeTab === 'sql'}
                onClick={() => setActiveTab('sql')}
              >
                SQL
              </button>
            </div>
          )}

          <div className={classes.header}>
            {title && <div className={classes.title}>{title}</div>}
            {activeTab === 'table' && data.length > 0 && (
              <div className={classes.download}>
                <button
                  className={classes.download_button}
                  onClick={() => setDownloadMenuOpen(prev => !prev)}
                  aria-label="Download"
                  aria-haspopup="menu"
                  aria-expanded={downloadMenuOpen}
                  title="Download"
                >
                  <DownloadIcon />
                </button>
                {downloadMenuOpen && (
                  <>
                    <div className={classes.download_backdrop} onClick={() => setDownloadMenuOpen(false)} />
                    <div className={classes.download_menu} role="menu">
                      <button
                        className={classes.download_menu_item}
                        role="menuitem"
                        onClick={() => handleDownload('csv')}
                      >
                        CSV
                      </button>
                      <button
                        className={classes.download_menu_item}
                        role="menuitem"
                        onClick={() => handleDownload('jsonl')}
                      >
                        JSON Lines
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {activeTab === 'sql' ? (
            <div className={classes.sql_view}>
              {sql && (
                <div className={classes.sql_block}>
                  <StreamdownClient>{`\`\`\`sql\n${sql}\n\`\`\``}</StreamdownClient>
                </div>
              )}
              {sqlExplanation && (
                <div className={classes.sql_explanation}>
                  <StreamdownClient>{sqlExplanation}</StreamdownClient>
                </div>
              )}
            </div>
          ) : data.length === 0 ? (
            <div className={classes.empty_state}>No data available</div>
          ) : (
            <>
              <div className={classes.table_wrapper}>
                <table className={classes.table}>
                  <thead className={classes.table_header}>
                    <tr>
                      {columns.map((column, index) => (
                        <th key={index} className={classes.table_header_cell}>
                          <div className={classes.header_cell_content}>
                            <span className={classes.header_label}>{column.header}</span>
                            {rowType === 'OBJECT' && column.key && (
                              <span className={classes.header_key}>{column.key}</span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((row, rowIndex) => (
                      <tr key={rowIndex} className={classes.table_row}>
                        {columns.map((column, colIndex) => {
                          const rawValue = getCellValue(row, column, colIndex, rowType);
                          const formattedValue = formatCellValue(rawValue, column.format);

                          return (
                            <td key={colIndex} className={classes.table_cell}>
                              {formattedValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination && totalPages > 1 && (
                <div className={classes.pagination}>
                  <button
                    className={classes.pagination_button}
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    &lt;
                  </button>
                  {getPageItems(currentPage, totalPages).map((item, index) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${index}`} className={classes.pagination_ellipsis}>
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        className={clsx(
                          classes.pagination_page,
                          item === currentPage && classes['pagination_page--active'],
                        )}
                        onClick={() => setCurrentPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    className={classes.pagination_button}
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </>
          )}

          {snackbar.visible && (
            <div className={classes.snackbar}>
              <span className={classes.snackbar_text}>Downloaded</span>
              <button className={classes.snackbar_action} onClick={handleOpenFile}>
                Open
              </button>
              <button className={classes.snackbar_close} onClick={handleCloseSnackbar} aria-label="Close">
                &times;
              </button>
            </div>
          )}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
