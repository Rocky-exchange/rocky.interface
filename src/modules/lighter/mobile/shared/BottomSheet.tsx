// src/modules/lighter/mobile/shared/BottomSheet.tsx
import { Drawer } from "vaul";
import type { ReactNode } from "react";
import styles from "./BottomSheet.module.scss";

export type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  /** 默认 'min(85vh, 640px)' */
  maxHeight?: string;
  /** 当返回 true 时拒绝关闭(用于"未保存输入"二次确认) */
  shouldBlockClose?: () => boolean;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  maxHeight = "min(85vh, 640px)",
  shouldBlockClose,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && shouldBlockClose?.()) return;
        onOpenChange(next);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content
          className={styles.content}
          style={{ maxHeight, paddingBottom: "var(--sai-bottom, 0px)" }}
          aria-label={typeof title === "string" ? title : undefined}
        >
          <div className={styles.handle} aria-hidden="true" />
          {title && (
            <>
              <Drawer.Title className={styles.title}>{title}</Drawer.Title>
              <Drawer.Description className="sr-only">
                {typeof title === "string" ? title : "Bottom sheet"}
              </Drawer.Description>
            </>
          )}
          <div className={styles.body}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
