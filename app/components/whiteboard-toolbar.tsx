"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { whiteboardTools } from "./map-editor-data";
import type { WhiteboardTool } from "./map-editor-types";

/**
 * 右侧白板工具栏的组件接口。
 *
 * 白板绘制能力还未落地时，这个组件只表达当前选择的工具，并把切换意图交给上层状态。
 */
type WhiteboardToolbarProps = {
  /** 当前激活的白板工具。 */
  activeTool: WhiteboardTool;
  /** 用户点击工具按钮时触发，用于切换白板工具模式。 */
  onToolChange: (tool: WhiteboardTool) => void;
};

export function WhiteboardToolbar({
  activeTool,
  onToolChange,
}: WhiteboardToolbarProps) {
  return (
    <div className="absolute right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur md:flex">
      {whiteboardTools.map((tool) => {
        const Icon = tool.icon;

        return (
          <Button
            aria-label={tool.label}
            className={cn(
              "size-10",
              activeTool === tool.id &&
                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            size="icon"
            title={tool.label}
            variant="ghost"
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}
