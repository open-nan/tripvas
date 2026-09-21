"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";
import { useState } from "react";

import {
  whiteboardBrushes,
  whiteboardColors,
  whiteboardTools,
} from "./map-editor-data";
import type { WhiteboardBrush, WhiteboardTool } from "./map-editor-types";

/**
 * 右侧白板工具栏的组件接口。
 *
 * 工具栏负责切换当前白板工具、画笔笔触和白板颜色；真正的绘制、选择、
 * 拖动、吸色、填充和擦除逻辑由 WhiteboardLayer 根据 activeTool 执行。
 */
type WhiteboardToolbarProps = {
  /** 当前选中的画笔笔触。 */
  activeBrush: WhiteboardBrush;
  /** 当前白板绘制颜色，新建线条、文字和填充工具都会使用这个颜色。 */
  activeColor: string;
  /** 当前激活的白板工具。 */
  activeTool: WhiteboardTool;
  /** 用户选择画笔笔触时触发。 */
  onBrushChange: (brush: WhiteboardBrush) => void;
  /** 用户选择或吸取颜色时触发，用于同步白板当前颜色。 */
  onColorChange: (color: string) => void;
  /** 用户点击工具按钮时触发，用于切换白板工具模式。 */
  onToolChange: (tool: WhiteboardTool) => void;
};

export function WhiteboardToolbar({
  activeBrush,
  activeColor,
  activeTool,
  onBrushChange,
  onColorChange,
  onToolChange,
}: WhiteboardToolbarProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  return (
    <div className="absolute right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur md:flex">
      <div className="relative">
        {isPaletteOpen && (
          <div
            aria-label="白板调色盘"
            className="whiteboard-color-popover"
            role="dialog"
          >
            <div className="whiteboard-color-grid">
              {whiteboardColors.map((color) => (
                <button
                  aria-label={`白板颜色 ${color}`}
                  aria-pressed={activeColor === color}
                  className={cn(
                    "whiteboard-color-button",
                    activeColor === color && "whiteboard-color-button-active",
                  )}
                  key={color}
                  style={{ backgroundColor: color }}
                  title={color}
                  type="button"
                  onClick={() => onColorChange(color)}
                />
              ))}
            </div>

            <label
              className="whiteboard-custom-color-field"
              title="自定义颜色"
            >
              <span
                aria-hidden="true"
                className="whiteboard-custom-color-preview"
                style={{ backgroundColor: activeColor }}
              />
              <input
                aria-label="自定义白板颜色"
                type="color"
                value={activeColor}
                onChange={(event) => onColorChange(event.target.value)}
              />
            </label>
          </div>
        )}

        <Button
          aria-label={isPaletteOpen ? "收起白板调色盘" : "展开白板调色盘"}
          aria-pressed={isPaletteOpen}
          className={cn(
            "relative size-10",
            isPaletteOpen &&
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          )}
          onClick={() => setIsPaletteOpen((currentOpen) => !currentOpen)}
          size="icon"
          title="调色盘"
          variant="ghost"
        >
          <Palette className="size-4" />
          <span
            aria-hidden="true"
            className="whiteboard-toolbar-color-swatch"
            style={{ backgroundColor: activeColor }}
          />
        </Button>
      </div>

      {whiteboardTools.map((tool) => {
        const Icon = tool.icon;

        return (
          <div className="relative" key={tool.id}>
            {tool.id === "pen" && activeTool === "pen" && (
              <div
                aria-label="笔触选择"
                className="absolute right-full top-1/2 mr-2 flex -translate-y-1/2 gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur"
              >
                {whiteboardBrushes.map((brush) => {
                  const BrushIcon = brush.icon;

                  return (
                    <Button
                      aria-label={brush.label}
                      aria-pressed={activeBrush === brush.id}
                      className={cn(
                        "size-9",
                        activeBrush === brush.id &&
                          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                      )}
                      key={brush.id}
                      onClick={() => {
                        onBrushChange(brush.id);
                        onToolChange("pen");
                      }}
                      size="icon"
                      title={brush.label}
                      variant="ghost"
                    >
                      <BrushIcon className="size-4" />
                    </Button>
                  );
                })}
              </div>
            )}

            <Button
              aria-label={tool.label}
              className={cn(
                "size-10",
                activeTool === tool.id &&
                  "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
              )}
              onClick={() => onToolChange(tool.id)}
              size="icon"
              title={tool.label}
              variant="ghost"
            >
              <Icon className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
