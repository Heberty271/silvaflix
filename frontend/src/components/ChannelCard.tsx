"use client";

import { Channel } from "@/lib/api";

function getResolutionBadge(name: string, streamUrl: string): string | null {
  const text = `${name} ${streamUrl}`.toUpperCase();
  if (text.includes("4K") || text.includes("UHD") || text.includes("2160")) return "4K";
  if (text.includes("FHD") || text.includes("1080")) return "FHD";
  if (text.includes("HD") || text.includes("720")) return "HD";
  return null;
}

function getChannelStyle(channel: Channel): {
  bgGradient: string;
  icon: string;
  shortCode: string;
  accentColor: string;
} {
  const name = channel.name.toLowerCase();
  const cat = channel.category.toLowerCase();

  if (name.includes("nasa")) {
    return {
      bgGradient: "from-blue-900 via-indigo-950 to-slate-950",
      icon: "🚀",
      shortCode: "NASA",
      accentColor: "text-blue-400",
    };
  }
  if (name.includes("red bull") || name.includes("sport") || cat.includes("esporte") || cat.includes("futebol")) {
    return {
      bgGradient: "from-blue-950 via-slate-900 to-red-950",
      icon: "⚽",
      shortCode: "SPORT",
      accentColor: "text-red-400",
    };
  }
  if (name.includes("filme") || name.includes("cine") || name.includes("sony") || name.includes("telecine") || cat.includes("filme") || cat.includes("serie")) {
    return {
      bgGradient: "from-purple-950 via-slate-900 to-rose-950",
      icon: "🎬",
      shortCode: "CINE",
      accentColor: "text-purple-400",
    };
  }
  if (name.includes("notícia") || name.includes("news") || name.includes("dw") || name.includes("euronews") || cat.includes("notícia")) {
    return {
      bgGradient: "from-red-950 via-neutral-900 to-stone-950",
      icon: "📰",
      shortCode: "NEWS",
      accentColor: "text-red-400",
    };
  }
  if (name.includes("kids") || name.includes("junior") || name.includes("infantil") || name.includes("cartoon") || name.includes("gloob") || cat.includes("infantil") || cat.includes("desenho")) {
    return {
      bgGradient: "from-amber-950 via-orange-950 to-yellow-950",
      icon: "👶",
      shortCode: "KIDS",
      accentColor: "text-amber-400",
    };
  }
  if (name.includes("anime")) {
    return {
      bgGradient: "from-pink-950 via-purple-950 to-indigo-950",
      icon: "⚡",
      shortCode: "ANIME",
      accentColor: "text-pink-400",
    };
  }
  if (name.includes("arte") || name.includes("cultura") || cat.includes("cultura") || cat.includes("educa")) {
    return {
      bgGradient: "from-emerald-950 via-teal-950 to-slate-950",
      icon: "🎨",
      shortCode: "ARTE",
      accentColor: "text-emerald-400",
    };
  }
  if (name.includes("brasil") || name.includes("senado") || name.includes("câmara") || cat.includes("aberto")) {
    return {
      bgGradient: "from-emerald-950 via-green-950 to-yellow-950",
      icon: "🇧🇷",
      shortCode: "TV BR",
      accentColor: "text-emerald-400",
    };
  }
  if (cat.includes("religi") || cat.includes("gospel") || cat.includes("igreja")) {
    return {
      bgGradient: "from-sky-950 via-slate-900 to-indigo-950",
      icon: "🙏",
      shortCode: "FÉ",
      accentColor: "text-sky-400",
    };
  }
  if (cat.includes("música") || cat.includes("musica") || name.includes("mtv") || name.includes("radio")) {
    return {
      bgGradient: "from-fuchsia-950 via-purple-950 to-slate-950",
      icon: "🎵",
      shortCode: "MUSIC",
      accentColor: "text-fuchsia-400",
    };
  }

  return {
    bgGradient: "from-slate-900 via-neutral-900 to-zinc-950",
    icon: "📡",
    shortCode: "TV",
    accentColor: "text-brand",
  };
}

export function ChannelCard({
  channel,
  isSelected,
  isFavorite,
  viewMode = "grid",
  isSelectMode = false,
  isSelectedForBulk = false,
  onSelect,
  onToggleFavorite,
  onToggleBulkSelect,
  onDelete,
  canDelete,
}: {
  channel: Channel;
  isSelected: boolean;
  isFavorite: boolean;
  viewMode?: "grid" | "list";
  isSelectMode?: boolean;
  isSelectedForBulk?: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleBulkSelect?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const style = getChannelStyle(channel);
  const resolution = getResolutionBadge(channel.name, channel.stream_url);

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectMode && onToggleBulkSelect) {
      e.stopPropagation();
      onToggleBulkSelect();
    } else {
      onSelect();
    }
  };

  if (viewMode === "list") {
    return (
      <div
        onClick={handleClick}
        className={`group relative flex items-center justify-between gap-3.5 rounded-2xl border p-3 text-left transition-all duration-200 cursor-pointer backdrop-blur shadow-sm ${
          isSelected
            ? "border-red-500 bg-red-950/40 ring-1 ring-red-500/50"
            : isSelectedForBulk
            ? "border-brand bg-brand/10"
            : "border-rule/70 bg-panel hover:border-brand/60 hover:bg-panel2"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isSelectMode && (
            <input
              type="checkbox"
              checked={isSelectedForBulk}
              onChange={() => onToggleBulkSelect && onToggleBulkSelect()}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-red-600 rounded cursor-pointer"
            />
          )}

          <div className={`relative flex h-10 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${style.bgGradient} p-1 border border-white/10 overflow-hidden flex-shrink-0`}>
            {channel.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channel.logo_url}
                alt={channel.name}
                className="h-7 w-full object-contain drop-shadow"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-base">{style.icon}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-black text-ink group-hover:text-brand transition-colors">
                {channel.name}
              </h3>
              {resolution && (
                <span className="rounded bg-panel2 px-1.5 py-0.2 text-[9px] font-black text-amber-400 border border-amber-500/30">
                  {resolution}
                </span>
              )}
            </div>
            <p className="text-[11px] text-mute truncate mt-0.5">
              {channel.category} {channel.is_custom ? "• IPTV" : "• Aberto"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
              isFavorite
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "text-mute hover:text-amber-400 hover:bg-white/10"
            }`}
            title={isFavorite ? "Remover dos favoritos" : "Favoritar canal"}
          >
            {isFavorite ? "★" : "☆"}
          </button>

          {canDelete && onDelete && !isSelectMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Excluir canal"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all"
            >
              ✕
            </button>
          )}

          <span className="text-xs font-bold text-mute group-hover:text-brand transition-colors px-1">
            ▶
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 cursor-pointer backdrop-blur shadow-lg ${
        isSelected
          ? "border-red-500 bg-red-950/30 shadow-red-900/30 ring-2 ring-red-500/50 scale-[1.02]"
          : isSelectedForBulk
          ? "border-brand bg-brand/10 ring-2 ring-brand/40"
          : "border-rule/80 bg-panel/90 hover:border-brand/70 hover:bg-panel2 hover:shadow-2xl hover:scale-[1.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-3 z-10">
        <div className="flex items-center gap-1.5">
          {isSelectMode ? (
            <input
              type="checkbox"
              checked={isSelectedForBulk}
              onChange={() => onToggleBulkSelect && onToggleBulkSelect()}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-red-600 rounded cursor-pointer"
            />
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-500 border border-red-500/40">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              AO VIVO
            </span>
          )}

          {resolution && (
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-amber-400 border border-amber-500/40">
              {resolution}
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all backdrop-blur ${
            isFavorite
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              : "text-mute hover:text-amber-400 hover:bg-white/10"
          }`}
          title={isFavorite ? "Remover dos favoritos" : "Favoritar canal"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>

      <div
        className={`relative flex h-24 w-full flex-col items-center justify-center rounded-xl bg-gradient-to-br ${style.bgGradient} p-3 border border-white/10 overflow-hidden shadow-inner group-hover:border-brand/40 transition-all`}
      >
        <div className="pointer-events-none absolute -inset-1 opacity-20 blur-xl bg-white/20" />

        {channel.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logo_url}
            alt={channel.name}
            className="h-12 w-full max-w-[120px] object-contain drop-shadow-md transition-transform group-hover:scale-110"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : null}

        <div className="flex items-center gap-1.5 text-center mt-1">
          <span className="text-xl drop-shadow">{style.icon}</span>
          <span className={`text-xs font-black tracking-wider uppercase ${style.accentColor} drop-shadow`}>
            {style.shortCode}
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
          <span className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-black text-white shadow-xl">
            <span>▶</span> Assistir Agora
          </span>
        </div>
      </div>

      <div className="mt-3.5 min-w-0">
        <h3 className="truncate text-sm font-black text-ink group-hover:text-brand transition-colors">
          {channel.name}
        </h3>
        <p className="truncate text-xs text-mute font-medium mt-0.5">
          {channel.category} {channel.is_custom ? "• IPTV" : ""}
        </p>
      </div>

      {canDelete && onDelete && !isSelectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Excluir canal"
          className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-lg bg-red-600/20 text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all shadow"
        >
          ✕
        </button>
      )}
    </div>
  );
}
