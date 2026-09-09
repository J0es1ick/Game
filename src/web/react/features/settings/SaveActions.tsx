import { useLayoutEffect, useRef, useState } from "react";
import { SaveTransferController } from "../../app/state/SaveTransferController";
import { useGameStore } from "../../app/state/GameContext";

export function SaveActions() {
  const store = useGameStore();
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const transfer = new SaveTransferController(store.repository, store.storage);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reportError = (error: unknown, title: string) => {
    if (!mounted.current) return;
    setErrorMessage(error instanceof Error ? error.message : String(error));
    store.fail(error, title);
  };
  const exportFile = () => {
    setErrorMessage(null);
    try {
      const hero = store.game?.save.hero;
      const download = transfer.export(
        hero?.name ?? "hero",
        store.game?.save.worldDay ?? 1,
        store.game?.save,
      );
      const url = URL.createObjectURL(
        new Blob([download.content], {
          type: "application/json;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = download.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      reportError(error, "Файл не скачан");
    }
  };
  const importFile = async (file: File) => {
    if (
      !window.confirm(
        "Заменить текущую летопись файлом? Последняя исправная копия останется в резерве.",
      )
    )
      return;
    setBusy(true);
    setErrorMessage(null);
    try {
      if (!(await store.importSave(file))) return;
      store.notify({
        eyebrow: "СОХРАНЕНИЕ",
        title: "Летопись загружена",
        description: "Можно продолжить игру.",
        tone: "positive",
      });
    } catch (error) {
      reportError(error, "Файл не загружен");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const restore = () => {
    if (
      !window.confirm(
        "Вернуть предыдущее исправное состояние? Текущее состояние останется резервной копией.",
      )
    )
      return;
    setErrorMessage(null);
    try {
      store.restoreBackup();
    } catch (error) {
      reportError(error, "Копия не восстановлена");
    }
  };
  return (
    <div className="save-recovery-actions">
      <strong>Сохранение героя</strong>
      <p>
        Прогресс хранится в этом браузере. Скачайте файл, чтобы перенести его на
        другое устройство.
      </p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {store.game && (
        <button className="plain-button" onClick={exportFile}>
          Скачать сохранение
        </button>
      )}
      <button
        className="plain-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Проверяем файл…" : "Загрузить из файла"}
      </button>
      <button
        className="plain-button"
        disabled={!store.hasBackup() || busy}
        onClick={restore}
      >
        Вернуть предыдущую копию
      </button>
      <button
        className="plain-button danger"
        onClick={() => {
          if (
            window.confirm(
              "Удалить текущую летопись и создать нового героя? Это действие нельзя отменить.",
            )
          )
            store.reset();
        }}
      >
        Начать новую игру
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
    </div>
  );
}
