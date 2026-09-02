"use client";

import { Download, LocateFixed, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LocationStatus } from "./map-editor-types";

/**
 * 左上角浮动操作区的组件接口。
 *
 * 当前承载定位开关、导入、导出入口；只有定位能力接入了真实状态，其余按钮仍是 UI 入口。
 */
type FloatingActionsProps = {
  /** 定位开关是否已经开启。 */
  isLocated: boolean;
  /** 定位状态说明文案，用于展示定位中、已定位或失败原因。 */
  locationMessage: string;
  /** 当前定位状态，决定提示条样式和可访问性角色。 */
  locationStatus: LocationStatus;
  /** 点击定位按钮时触发，由上层负责启动或停止浏览器定位。 */
  onLocate: () => void;
};

export function FloatingActions({
  isLocated,
  locationMessage,
  locationStatus,
  onLocate,
}: FloatingActionsProps) {
  const shouldShowLocationStatus = locationStatus !== "idle";

  return (
    <div className="absolute left-5 top-5 z-30 flex max-w-[calc(100vw-96px)] items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur">
        <Button
          aria-label={isLocated ? "关闭定位" : "开启定位"}
          aria-pressed={isLocated}
          className={cn(
            isLocated &&
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          )}
          onClick={onLocate}
          size="icon"
          title={isLocated ? "关闭定位" : "开启定位"}
          variant="ghost"
        >
          <LocateFixed className="size-4" />
        </Button>
        <Separator className="h-5" orientation="vertical" />
        <Button aria-label="导入" size="icon" title="导入" variant="ghost">
          <Upload className="size-4" />
        </Button>
        <Button aria-label="导出 PNG" size="icon" title="导出 PNG" variant="ghost">
          <Download className="size-4" />
        </Button>
      </div>

      {shouldShowLocationStatus && (
        <div
          className={cn(
            "flex min-h-10 min-w-0 max-w-[min(320px,calc(100vw-176px))] items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-lg shadow-black/10 backdrop-blur",
            locationStatus === "error"
              ? "border-destructive/30 text-destructive"
              : "border-border text-muted-foreground",
          )}
          role={locationStatus === "error" ? "alert" : "status"}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              locationStatus === "active" && "bg-primary",
              locationStatus === "locating" && "bg-amber-500",
              locationStatus === "error" && "bg-destructive",
            )}
            aria-hidden="true"
          />
          <span className="truncate">{locationMessage}</span>
        </div>
      )}
    </div>
  );
}
