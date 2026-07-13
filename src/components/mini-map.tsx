export function MiniMap() {
  return (
    <div className="anim-fade-in relative aspect-[16/9] w-full overflow-hidden rounded-[10px] border border-[#D6E0DB] bg-[#E5EDE9]">
      {/* streets */}
      <div className="absolute inset-x-0 top-[38%] h-[14px] rotate-[-4deg] bg-[#F4F7F5]" />
      <div className="absolute inset-y-0 left-[30%] w-[10px] rotate-[8deg] bg-[#F4F7F5]" />
      <div className="absolute inset-y-0 left-[68%] w-[8px] rotate-[-6deg] bg-[#F4F7F5]" />
      {/* blocks */}
      <div className="absolute left-[8%] top-[10%] h-[34px] w-[52px] rounded-[2px] bg-[#DBE6E0]" />
      <div className="absolute bottom-[12%] right-[10%] h-[28px] w-[64px] rounded-[2px] bg-[#DBE6E0]" />
      {/* pin */}
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0F766E"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[88%] [filter:drop-shadow(0_2px_3px_rgba(28,25,23,0.25))]"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#F0FDFA" />
        <circle cx="12" cy="10" r="3" fill="#0F766E" stroke="none" />
      </svg>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-2.5 py-1 text-xs text-[#57534E]">
        Déplacez le pin si besoin
      </div>
    </div>
  );
}
