"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  Clipboard,
  Download,
  FileJson,
  FileUp,
  Share2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  ImportExportPanelView,
  MapExportTemplate,
  MapTemplateImportResult,
} from "./map-editor-types";

/**
 * 导入导出面板的组件接口。
 *
 * 组件只处理导入导出 UI、文件读取和剪贴板交互；模板生成、解析和写回顶层状态
 * 都交给 MapEditor，避免导入动作绕过应用的统一状态模型。
 */
type ImportExportDetailProps = {
  /** 当前面板视图，导出视图展示模板和 P2P 码，导入视图展示粘贴和文件导入。 */
  view: ImportExportPanelView;
  /** 当前地图编辑器状态生成的导出模板。 */
  template: MapExportTemplate;
  /** 当前模板编码后的 P2P 分享码。 */
  shareCode: string;
  /** 下载模板 JSON 文件。 */
  onDownloadTemplate: () => void;
  /** 从用户粘贴内容或文件内容导入模板。 */
  onImportSource: (source: string) => MapTemplateImportResult;
  /** 切换导入导出视图。 */
  onViewChange: (view: ImportExportPanelView) => void;
};

/**
 * 导入导出数据概览组件接口。
 */
type ImportExportSummaryProps = {
  /** 当前导出模板。 */
  template: MapExportTemplate;
  /** 当前 P2P 分享码。 */
  shareCode: string;
};

export function ImportExportDetail({
  view,
  template,
  shareCode,
  onDownloadTemplate,
  onImportSource,
  onViewChange,
}: ImportExportDetailProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSource, setImportSource] = useState("");
  const [message, setMessage] = useState<MapTemplateImportResult | null>(null);

  const handleCopyShareCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setMessage({ ok: true, message: "已复制 P2P 分享码" });
    } catch {
      setMessage({ ok: false, message: "复制失败，请手动选择分享码" });
    }
  };

  const handleImport = (source: string) => {
    const result = onImportSource(source);

    setMessage(result);

    if (result.ok) {
      setImportSource("");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const source = typeof reader.result === "string" ? reader.result : "";

      setImportSource(source);
      handleImport(source);
    };
    reader.onerror = () => {
      setMessage({ ok: false, message: "模板文件读取失败" });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <Button
          aria-pressed={view === "export"}
          size="sm"
          type="button"
          variant={view === "export" ? "default" : "ghost"}
          onClick={() => onViewChange("export")}
        >
          <Download className="size-4" />
          导出
        </Button>
        <Button
          aria-pressed={view === "import"}
          size="sm"
          type="button"
          variant={view === "import" ? "default" : "ghost"}
          onClick={() => onViewChange("import")}
        >
          <FileUp className="size-4" />
          导入
        </Button>
      </div>

      <ImportExportSummary shareCode={shareCode} template={template} />

      <Separator />

      {view === "export" ? (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={onDownloadTemplate}>
              <FileJson className="size-4" />
              下载模板
            </Button>
            <Button type="button" variant="secondary" onClick={handleCopyShareCode}>
              <Share2 className="size-4" />
              复制 P2P
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-share-code">P2P 分享码</Label>
            <textarea
              className="import-export-textarea"
              id="map-share-code"
              readOnly
              spellCheck={false}
              value={shareCode}
            />
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <input
            accept="application/json,.json"
            aria-hidden="true"
            className="sr-only"
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
            onChange={handleFileChange}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="size-4" />
              选择文件
            </Button>
            <Button type="button" onClick={() => handleImport(importSource)}>
              <Clipboard className="size-4" />
              导入模板
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-import-source">P2P 导入</Label>
            <textarea
              className="import-export-textarea"
              id="map-import-source"
              placeholder="NANMAP1..."
              spellCheck={false}
              value={importSource}
              onChange={(event) => setImportSource(event.target.value)}
            />
          </div>
        </section>
      )}

      {message && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs leading-5",
            message.ok
              ? "border-primary/25 bg-primary/5 text-primary"
              : "border-destructive/25 bg-destructive/5 text-destructive",
          )}
          role={message.ok ? "status" : "alert"}
        >
          {message.message}
        </div>
      )}
    </div>
  );
}

function ImportExportSummary({
  template,
  shareCode,
}: ImportExportSummaryProps) {
  const plannedRouteCount = Object.keys(template.plannedPointRoutes).length;

  return (
    <section className="grid grid-cols-2 gap-2">
      <SummaryItem label="点位" value={`${template.markers.length}`} />
      <SummaryItem label="线路" value={`${template.routeConnections.length}`} />
      <SummaryItem label="已规划" value={`${plannedRouteCount}`} />
      <SummaryItem label="白板" value={`${template.whiteboard.elements.length}`} />
      <SummaryItem label="城市" value={template.city || "未设置"} />
      <SummaryItem label="大小" value={formatTemplateSize(shareCode)} />
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Badge variant="outline">{value}</Badge>
      </div>
    </div>
  );
}

function formatTemplateSize(value: string) {
  const bytes = new TextEncoder().encode(value).length;

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}
