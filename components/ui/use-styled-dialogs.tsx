"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DialogVariant = "default" | "danger";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
};

type PromptOptions = ConfirmOptions & {
  placeholder?: string;
  initialValue?: string;
};

type InternalDialogState =
  | ({
      kind: "confirm";
      resolve: (value: boolean) => void;
    } & ConfirmOptions)
  | ({
      kind: "prompt";
      resolve: (value: string | null) => void;
      placeholder?: string;
      inputValue: string;
    } & ConfirmOptions);

const BASE_BTN =
  "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

function getConfirmBtnClass(variant: DialogVariant | undefined) {
  if (variant === "danger") {
    return `${BASE_BTN} bg-red-600 text-white hover:bg-red-500`;
  }
  return `${BASE_BTN} bg-[#009ade] text-white hover:bg-[#0085c1]`;
}

export function useStyledDialogs() {
  const [dialog, setDialog] = useState<InternalDialogState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dialog.kind === "confirm") dialog.resolve(false);
        if (dialog.kind === "prompt") dialog.resolve(null);
        setDialog(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    if (dialog.kind === "prompt") {
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [dialog]);

  useEffect(() => {
    return () => {
      if (!dialog) return;
      if (dialog.kind === "confirm") dialog.resolve(false);
      if (dialog.kind === "prompt") dialog.resolve(null);
    };
  }, [dialog]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        kind: "confirm",
        resolve,
        title: options.title ?? "Confirmar acción",
        message: options.message,
        confirmText: options.confirmText ?? "Aceptar",
        cancelText: options.cancelText ?? "Cancelar",
        variant: options.variant ?? "default",
      });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setDialog({
        kind: "prompt",
        resolve,
        title: options.title ?? "Confirmar acción",
        message: options.message,
        confirmText: options.confirmText ?? "Aceptar",
        cancelText: options.cancelText ?? "Cancelar",
        variant: options.variant ?? "default",
        placeholder: options.placeholder,
        inputValue: options.initialValue ?? "",
      });
    });
  }, []);

  const dialogElement = useMemo(() => {
    if (!dialog) return null;
    return (
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (dialog.kind === "confirm") dialog.resolve(false);
          if (dialog.kind === "prompt") dialog.resolve(null);
          setDialog(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#141c28] p-6 text-white shadow-2xl"
        >
          <h3 className="text-lg font-bold">{dialog.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-neutral-300">{dialog.message}</p>

          {dialog.kind === "prompt" ? (
            <input
              ref={inputRef}
              value={dialog.inputValue}
              onChange={(event) =>
                setDialog((prev) =>
                  prev?.kind === "prompt" ? { ...prev, inputValue: event.target.value } : prev,
                )
              }
              placeholder={dialog.placeholder ?? ""}
              className="mt-4 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            />
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (dialog.kind === "confirm") dialog.resolve(false);
                if (dialog.kind === "prompt") dialog.resolve(null);
                setDialog(null);
              }}
              className={`${BASE_BTN} border border-white/20 text-neutral-200 hover:bg-white/10`}
            >
              {dialog.cancelText ?? "Cancelar"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (dialog.kind === "confirm") dialog.resolve(true);
                if (dialog.kind === "prompt") dialog.resolve(dialog.inputValue);
                setDialog(null);
              }}
              className={getConfirmBtnClass(dialog.variant)}
            >
              {dialog.confirmText ?? "Aceptar"}
            </button>
          </div>
        </div>
      </div>
    );
  }, [dialog]);

  return {
    confirm,
    prompt,
    dialogElement,
  };
}
