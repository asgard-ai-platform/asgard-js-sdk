import { ReactNode, useMemo, useState, CSSProperties, useCallback, useEffect } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import {
  ConversationBotMessage,
  TableMessageTemplate,
  TableColumn,
  TableColumnFormat,
  TableRowType,
} from '@asgard-js/core';
import { Time } from '../time';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import clsx from 'clsx';
import classes from './table-template.module.scss';

interface TableTemplateProps {
  message: ConversationBotMessage;
}

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

function DownloadIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function TableTemplate(props: TableTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as TableMessageTemplate;
  const { table, title, sql, sqlExplanation } = template;
  const { columns, data, pagination, rowType } = table;

  const { template: themeTemplate, botMessage } = useAsgardThemeContext();
  const { avatar } = useAsgardContext();

  const [activeTab, setActiveTab] = useState<'table' | 'sql'>('table');
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

  const triggerDownload = useCallback(
    (content: string, mimeType: string, extension: string): void => {
      const BOM = extension === 'csv' ? '﻿' : '';
      const blob = new Blob([BOM + content], { type: `${mimeType};charset=utf-8;` });
      const blobUrl = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTitle = (title || 'table').replace(/[^a-zA-Z0-9一-鿿]/g, '_');
      const fileName = `${safeTitle}_${timestamp}.${extension}`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSnackbar({ visible: true, fileName, blobUrl });
    },
    [title],
  );

  const handleDownloadCsv = useCallback((): void => {
    const content = convertToCsv(columns, data, rowType);
    triggerDownload(content, 'text/csv', 'csv');
  }, [columns, data, rowType, triggerDownload]);

  const handleDownloadJsonl = useCallback((): void => {
    const content = convertToJsonLines(columns, data, rowType);
    triggerDownload(content, 'application/x-ndjson', 'jsonl');
  }, [columns, data, rowType, triggerDownload]);

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
      <Avatar avatar={avatar} />
      <TemplateBoxContent quickReplies={template?.quickReplies}>
        <div className={classes.container} style={styles}>
          {sql ? (
            <>
              <div className={classes.tabs}>
                <button
                  className={clsx(classes.tab, activeTab === 'table' && classes.tab_active)}
                  onClick={() => setActiveTab('table')}
                >
                  Table
                </button>
                <button
                  className={clsx(classes.tab, activeTab === 'sql' && classes.tab_active)}
                  onClick={() => setActiveTab('sql')}
                >
                  SQL
                </button>
              </div>

              {activeTab === 'table' && (
                <>
                  <div className={classes.tab_content_header}>
                    {title && <div className={classes.title}>{title}</div>}
                    {data.length > 0 && (
                      <div className={classes.download_buttons}>
                        <button
                          className={classes.download_button}
                          onClick={handleDownloadCsv}
                          aria-label="Download CSV"
                          title="Download CSV"
                        >
                          <DownloadIcon /> CSV
                        </button>
                        <button
                          className={classes.download_button}
                          onClick={handleDownloadJsonl}
                          aria-label="Download JSONL"
                          title="Download JSON Lines"
                        >
                          <DownloadIcon /> JSONL
                        </button>
                      </div>
                    )}
                  </div>
                  {data.length === 0 ? (
                    <div className={classes.empty_state}>No data available</div>
                  ) : (
                    <>
                      <div className={classes.table_wrapper}>
                        <table className={classes.table}>
                          <thead className={classes.table_header}>
                            <tr>
                              {columns.map((column, index) => (
                                <th key={index} className={classes.table_header_cell}>
                                  <span className={classes.cell_header}>{column.header}</span>
                                  {column.key && <span className={classes.cell_key}>{column.key}</span>}
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
                          <span className={classes.pagination_info}>
                            {currentPage} / {totalPages}
                          </span>
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
                </>
              )}

              {activeTab === 'sql' && (
                <>
                  <div className={classes.tab_content_header}>
                    {title && <div className={classes.title}>{title}</div>}
                  </div>
                  <div className={classes.sql_body}>
                    <div className={classes.sql_code_area}>
                      <pre className={classes.sql_code}>
                        <code>{sql}</code>
                      </pre>
                    </div>
                    {sqlExplanation && <div className={classes.sql_explanation_panel}>{sqlExplanation}</div>}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className={classes.header}>
                {title && <div className={classes.title}>{title}</div>}
                {data.length > 0 && (
                  <div className={classes.download_buttons}>
                    <button
                      className={classes.download_button}
                      onClick={handleDownloadCsv}
                      aria-label="Download CSV"
                      title="Download CSV"
                    >
                      <DownloadIcon /> CSV
                    </button>
                    <button
                      className={classes.download_button}
                      onClick={handleDownloadJsonl}
                      aria-label="Download JSONL"
                      title="Download JSON Lines"
                    >
                      <DownloadIcon /> JSONL
                    </button>
                  </div>
                )}
              </div>
              {data.length === 0 ? (
                <div className={classes.empty_state}>No data available</div>
              ) : (
                <>
                  <div className={classes.table_wrapper}>
                    <table className={classes.table}>
                      <thead className={classes.table_header}>
                        <tr>
                          {columns.map((column, index) => (
                            <th key={index} className={classes.table_header_cell}>
                              <span className={classes.cell_header}>{column.header}</span>
                              {column.key && <span className={classes.cell_key}>{column.key}</span>}
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
                      <span className={classes.pagination_info}>
                        {currentPage} / {totalPages}
                      </span>
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
            </>
          )}

          {snackbar.visible && (
            <div className={classes.snackbar}>
              <span className={classes.snackbar_text}>Downloaded: {snackbar.fileName}</span>
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
      <Time className={classes.time} time={message.time} />
    </TemplateBox>
  );
}
