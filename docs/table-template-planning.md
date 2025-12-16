# TABLE Template 顯示功能規劃

本文件規劃 SDK 如何實作 TABLE (DOM_TABLE) template 顯示功能。

---

## 現有實作參考

TABLE template 的完整實作位於 **asgard-ai-data-insight-web** 專案中。Platform (asgard-ai-platform-web) 沒有 TABLE template 實作。

---

## 參考檔案路徑

### 1. 型別定義

| 檔案路徑                                                                                          | 說明                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/types/channel-view.ts`                     | `VisualSchemaChoice` 聯合型別、`DomTableSchema` 介面 |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/types/saved-view.ts`                       | `VisualSchemaChoice`、`SavedViewDto`                 |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/types/sse-response.ts`                     | `MessageTemplate`、`MessageTemplateType`             |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/constants/enum.ts`                         | `EventType.VIEW_UPDATE`、`MessageTemplateType`       |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/metrics/types/visualization.ts` | `VisualizationType`、`DomTableVisualizationProps`    |

### 2. UI 元件

| 檔案路徑                                                                                                              | 說明                          |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/metrics/visualizations/dom-table-visualization.tsx` | **核心 DOM_TABLE 渲染元件**   |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/chat/data-table.tsx`                                | 聊天介面中的 DOM_TABLE 渲染   |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/metrics/visualizations/visualization-container.tsx` | 視覺化通用容器                |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/metrics/visualizations/index.ts`                    | 導出 DomTableVisualization 等 |

### 3. 渲染邏輯

| 檔案路徑                                                                                               | 說明                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/chat/insight-results.tsx`            | 處理 DOM_TABLE 和 VEGA 混合視覺化、分頁邏輯 |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/chat/create-view-dialog.tsx`         | 建立保存檢視對話框                          |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/dialog/saved-view-detail-dialog.tsx` | 已保存檢視詳細資訊對話框                    |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/metrics/saved-view.tsx`              | 已保存檢視元件                              |

### 4. 分頁元件

| 檔案路徑                                                                                     | 說明         |
| -------------------------------------------------------------------------------------------- | ------------ |
| `/Users/jasonluo/Asgard/asgard-ai-data-insight-web/src/components/data-table/pagination.tsx` | 表格分頁邏輯 |

---

## 後端資料結構（SDK 實際使用）

```typescript
interface TableMessageTemplate {
  type: 'TABLE';
  title: string; // 表格標題，例如 "每月銷售額統計"
  table: {
    rowType: 'OBJECT' | 'ARRAY'; // 資料列格式
    columns: Array<{
      header: string; // 表頭顯示名稱
      key?: string; // 當 rowType = OBJECT 時，用於存取資料的鍵
      format?: 'DATE' | 'DATE_TIME' | 'CURRENCY'; // 格式化類型
    }>;
    pagination: {
      size: number; // 每頁筆數
    } | null; // null 表示不需要分頁
    data: Record<string, unknown>[] | unknown[][]; // OBJECT 或 ARRAY 格式
  };
}
```

### 資料範例

**rowType = OBJECT:**

```json
{
  "type": "TABLE",
  "title": "每月銷售額統計",
  "table": {
    "rowType": "OBJECT",
    "columns": [
      { "header": "姓名", "key": "name" },
      { "header": "年齡", "key": "age" },
      { "header": "建立時間", "key": "createdAt", "format": "DATE_TIME" }
    ],
    "pagination": { "size": 10 },
    "data": [
      { "name": "XXX", "age": 30, "createdAt": "2002-10-02T10:00:00-05:00" },
      { "name": "YYY", "age": 40, "createdAt": "2002-10-02T10:00:00-05:00" }
    ]
  }
}
```

**rowType = ARRAY:**

```json
{
  "type": "TABLE",
  "title": "每月銷售額統計",
  "table": {
    "rowType": "ARRAY",
    "columns": [
      { "header": "姓名" },
      { "header": "年齡" },
      { "header": "建立時間", "format": "DATE_TIME" }
    ],
    "pagination": null,
    "data": [
      ["XXX", "30", "2002-10-02T10:00:00-05:00"],
      ["YYY", "40", "2002-10-02T10:00:00-05:00"]
    ]
  }
}
```

---

## Data Insight Web 型別定義（參考）

### VisualSchemaChoice (聯合型別)

```typescript
type VisualSchemaChoice =
  | { type: 'DOM_TABLE'; dom_table_schema: DomTableSchema }
  | { type: 'VEGA'; vega_schema: VegaSchema };
```

### DomTableSchema

```typescript
interface DomTableSchema {
  columns: {
    name: string; // 欄位名稱 (用於資料存取)
    display_name: string; // 顯示名稱 (用於表頭)
    data_type?: string; // 資料類型
  }[];
}
```

### VisualizationType

```typescript
type VisualizationType = 'DOM_TABLE' | 'VEGA';
```

---

## 結構對照表

| SDK（後端提供）       | Data Insight Web      | 說明                          |
| --------------------- | --------------------- | ----------------------------- |
| `columns.key`         | `columns.name`        | 資料存取鍵                    |
| `columns.header`      | `columns.display_name`| 表頭顯示名稱                  |
| `columns.format`      | ❌ 無                 | 格式化：DATE/DATE_TIME/CURRENCY |
| `rowType`             | ❌ 僅 OBJECT          | 支援 OBJECT 和 ARRAY 兩種格式 |
| `pagination.size`     | 硬編碼 20             | 可配置每頁筆數                |
| `title`               | 從外部傳入            | 表格標題                      |

---

## 渲染邏輯

### 資料流程

```
SSE VIEW_UPDATE 事件
    │
    ▼
包含 visual_schema_choices: VisualSchemaChoice[]
    │
    ▼
按 type 過濾和分類
    │
    ├─── type === 'DOM_TABLE' → DomTableVisualization
    │
    └─── type === 'VEGA' → VegaVisualization
```

### 渲染決策範例

```typescript
// 來自 saved-view.tsx
switch (activeOption.type) {
  case 'DOM_TABLE':
    return <DomTableVisualization {...baseProps} schema={activeOption.dom_table_schema} />;
  case 'VEGA':
    return <VegaVisualization {...baseProps} schema={activeOption.vega_schema} />;
}
```

---

## DomTableVisualization 元件分析

### Props

```typescript
interface DomTableVisualizationProps {
  schema: DomTableSchema;
  data: Record<string, unknown>[];
}
```

### 渲染結構

```tsx
<Table>
  <TableHeader>
    <TableRow>
      {schema.columns.map(col => (
        <TableHead key={col.name}>{col.display_name}</TableHead>
      ))}
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((row, index) => (
      <TableRow key={index}>
        {schema.columns.map(col => (
          <TableCell key={col.name}>{row[col.name]}</TableCell>
        ))}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## SDK 實作方案

### 需要新增的檔案

1. **型別定義**

   - `packages/core/src/types/sse-response.ts` - 新增 `TableMessageTemplate`、相關介面
   - `packages/core/src/constants/enum.ts` - 新增 `MessageTemplateType.TABLE`

2. **UI 元件**

   - `packages/react/src/components/templates/table-template/table-template.tsx`
   - `packages/react/src/components/templates/table-template/table-template.module.scss`
   - `packages/react/src/components/templates/table-template/index.ts`

3. **渲染整合**
   - 修改 `conversation-message-renderer.tsx` 處理 TABLE 類型

### 實作優先順序

1. [ ] 新增型別定義（TableMessageTemplate、TableColumn、TablePagination 等）
2. [ ] 建立 TableTemplate 元件
   - [ ] 基本表格渲染（支援 OBJECT 和 ARRAY rowType）
   - [ ] 格式化功能（DATE、DATE_TIME、CURRENCY）
   - [ ] 分頁功能（當 pagination 不為 null 時）
3. [ ] 整合到訊息渲染流程
4. [ ] 新增主題支援

### 實作細節

#### 格式化函數

```typescript
type ColumnFormat = 'DATE' | 'DATE_TIME' | 'CURRENCY';

function formatCellValue(value: unknown, format?: ColumnFormat): string {
  if (value == null) return '';

  switch (format) {
    case 'DATE':
      return new Date(value as string).toLocaleDateString();
    case 'DATE_TIME':
      return new Date(value as string).toLocaleString();
    case 'CURRENCY':
      return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD'
      }).format(value as number);
    default:
      return String(value);
  }
}
```

#### 資料存取邏輯

```typescript
function getCellValue(
  row: Record<string, unknown> | unknown[],
  column: TableColumn,
  columnIndex: number,
  rowType: 'OBJECT' | 'ARRAY'
): unknown {
  if (rowType === 'ARRAY') {
    return (row as unknown[])[columnIndex];
  }
  return (row as Record<string, unknown>)[column.key!];
}
```

---

## 待確認事項

1. ~~SDK 是否需要支援分頁？~~ ✅ 是，由後端 `pagination` 欄位控制
2. 表格樣式是否需要自訂主題？
3. ~~是否需要支援 VEGA 圖表？~~ 目前只需要 TABLE
4. CURRENCY 格式的貨幣單位是否需要可配置？（目前假設 TWD）
5. 日期格式化是否需要支援 locale 配置？
