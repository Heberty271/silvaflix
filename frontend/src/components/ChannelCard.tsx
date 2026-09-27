"use client";

import { Channel } from "@/lib/api";

// Paleta de cores e ícones por categoria ou nome do canal
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
  if (name.includes("red bull") || name.includes("sport") || cat.includes("esporte")) {
    return {
      bgGradient: "from-blue-950 via-slate-900 to-red-950",
      icon: "⚽",
      shortCode: "SPORT",
      accentColor: "text-red-400",
    };
  }
  if (name.includes("filme") || name.includes("cine") || name.includes("sony") || name.includes("telecine") || cat.includes("filme")) {
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
  if (name.includes("kids") || name.includes("junior") || name.includes("infantil") || name.includes("cartoon") || name.includes("gloob") || cat.includes("infantil")) {
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
  if (name.includes("arte") || name.includes("cultura") || cat.includes("cultura")) {
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
  onSelect,
  onToggleFavorite,
  onDelete,
  canDelete,
}: {
  channel: Channel;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const style = getChannelStyle(channel);

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 cursor-pointer backdrop-blur shadow-lg ${
        isSelected
          ? "border-red-500 bg-red-950/30 shadow-red-900/30 ring-2 ring-red-500/50 scale-[1.02]"
          : "border-rule/80 bg-panel/90 hover:border-brand/70 hover:bg-panel2 hover:shadow-2xl hover:scale-[1.02]"
      }`}
    >
      {/* Topo do Card: Badge Ao Vivo + Favorito */}
      <div className="flex items-center justify-between mb-3 z-10">
        <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-500 border border-red-500/40">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          AO VIVO
        </span>

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

      {/* Caixa de Logo / Identidade Visual do Canal */}
      <div
        className={`relative flex h-24 w-full flex-col items-center justify-center rounded-xl bg-gradient-to-br ${style.bgGradient} p-3 border border-white/10 overflow-hidden shadow-inner group-hover:border-brand/40 transition-all`}
      >
        {/* Glow de fundo */}
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

        {/* Identidade tipográfica do Canal */}
        <div className="flex items-center gap-1.5 text-center mt-1">
          <span className="text-xl drop-shadow">{style.icon}</span>
          <span className={`text-xs font-black tracking-wider uppercase ${style.accentColor} drop-shadow`}>
            {style.shortCode}
          </span>
        </div>

        {/* Overlay "Assistir Agora" ao passar o mouse */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
          <span className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-black text-white shadow-xl">
            <span>▶</span> Assistir Agora
          </span>
        </div>
      </div>

      {/* Nome e Categoria */}
      <div className="mt-3.5 min-w-0">
        <h3 className="truncate text-sm font-black text-ink group-hover:text-brand transition-colors">
          {channel.name}
        </h3>
        <p className="truncate text-xs text-mute font-medium mt-0.5">
          {channel.category} {channel.is_custom ? "• IPTV" : ""}
        </p>
      </div>

      {/* Botão de Excluir Canal se for Admin */}
      {canDelete && onDelete && (
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
