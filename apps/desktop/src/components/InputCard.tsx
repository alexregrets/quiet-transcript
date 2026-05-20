import { motion } from "framer-motion";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Link2, UploadCloud } from "lucide-react";

const supportedMediaExtensions = new Set(["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv"]);

const isSupportedMediaFile = (file: File) => {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return true;
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  return extension ? supportedMediaExtensions.has(extension) : false;
};

interface BaseInputCardProps {
  eyebrow: string;
  labelRu: string;
  labelEn: string;
  title: string;
  description: string;
  icon: ReactNode;
}

interface FileInputCardProps extends BaseInputCardProps {
  kind: "file";
  disabled: boolean;
  actionLabel: string;
  onFileSelect: (file: File) => void;
  onInvalidFile: (message: string) => void;
}

interface UrlInputCardProps extends BaseInputCardProps {
  kind: "url";
  disabled: boolean;
  actionLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

type InputCardProps = FileInputCardProps | UrlInputCardProps;

export const InputCard = (props: InputCardProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const arrow = (
    <div className="pointer-events-none absolute right-5 top-5 rotate-[-4deg] text-right font-marker leading-none text-app-text">
      <div className="text-[34px]">{props.labelRu}</div>
      <div className="text-[28px] opacity-80">{props.labelEn}</div>
      <div className="mt-1 text-[52px]">↙</div>
    </div>
  );

  if (props.kind === "file") {
    const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        props.onFileSelect(file);
      }
    };

    const handleDragEnter = (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!props.disabled) {
        setIsDragOver(true);
      }
    };

    const handleDragOver = (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!props.disabled) {
        event.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }
    };

    const handleDragLeave = (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragOver(false);
    };

    const handleDrop = (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragOver(false);

      if (props.disabled) {
        return;
      }

      const file = event.dataTransfer.files.item(0);
      if (!file) {
        return;
      }

      if (!isSupportedMediaFile(file)) {
        props.onInvalidFile("Please drop an audio or video file.");
        return;
      }

      props.onFileSelect(file);
    };

    return (
      <motion.section
        className={`glass-panel relative min-h-[340px] overflow-hidden rounded-[24px] p-6 transition ${
          isDragOver ? "border-app-accent shadow-lift" : ""
        }`}
        whileHover={{ y: -3 }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {arrow}
        {isDragOver ? (
          <div className="absolute inset-x-6 top-6 rounded-full border border-app-accent/70 bg-app-panel-strong/90 px-4 py-2 text-center text-sm font-semibold text-app-text">
            Release to upload
          </div>
        ) : null}
        <div className="flex h-full flex-col justify-end">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-card border border-app-border/80 bg-app-panel-strong/70 text-app-text">
            {props.icon}
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-app-muted">{props.eyebrow}</p>
          <h2 className="mt-2 max-w-sm text-2xl font-semibold text-app-text">{props.title}</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-app-muted">{props.description}</p>
          <label className="mt-6 inline-flex h-11 w-fit cursor-pointer items-center justify-center gap-2 rounded-full bg-app-text px-5 text-sm font-semibold text-app-bg shadow-soft transition hover:opacity-90">
            <UploadCloud className="h-4 w-4" />
            {props.actionLabel}
            <input accept="audio/*,video/*" className="hidden" disabled={props.disabled} type="file" onChange={handleFile} />
          </label>
        </div>
      </motion.section>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <motion.section whileHover={{ y: -3 }} className="glass-panel relative min-h-[340px] overflow-hidden rounded-[24px] p-6">
      {arrow}
      <form className="flex h-full flex-col justify-end" onSubmit={handleSubmit}>
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-card border border-app-border/80 bg-app-panel-strong/70 text-app-text">
          {props.icon}
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-app-muted">{props.eyebrow}</p>
        <h2 className="mt-2 max-w-sm text-2xl font-semibold text-app-text">{props.title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-app-muted">{props.description}</p>
        <div className="mt-6 flex gap-2">
          <input
            className="quiet-input h-11 min-w-0 flex-1 rounded-full px-4 text-sm"
            placeholder={props.placeholder}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
          <button
            className="inline-flex h-11 items-center gap-2 rounded-full bg-app-text px-5 text-sm font-semibold text-app-bg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            disabled={props.disabled || !props.value}
            type="submit"
          >
            <Link2 className="h-4 w-4" />
            {props.actionLabel}
          </button>
        </div>
      </form>
    </motion.section>
  );
};
