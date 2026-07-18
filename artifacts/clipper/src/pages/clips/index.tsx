import { useState } from "react";
import { Link } from "wouter";
import { useListClips, ClipStatus, ListClipsFormat } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Play, Clock, SlidersHorizontal, ArrowDownToLine, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function ClipsGallery() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClipStatus | "all">("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");

  const { data: clips, isLoading } = useListClips({
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(formatFilter !== "all" && { format: formatFilter as ListClipsFormat }),
  });

  const filteredClips = clips?.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    (c.projectTitle && c.projectTitle.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Clips Gallery</h1>
        <p className="text-muted-foreground">All generated short-form content across your projects.</p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clips or projects..."
            className="pl-9 bg-black/20 border-white/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rendering">Rendering</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={formatFilter} onValueChange={(val) => setFormatFilter(val)}>
            <SelectTrigger className="w-[140px] bg-black/20 border-white/10">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              <SelectItem value="shorts">YouTube Shorts</SelectItem>
              <SelectItem value="reels">IG Reels</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="square">Square</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="aspect-[9/16] rounded-xl bg-card/40" />
          ))}
        </div>
      ) : filteredClips?.length === 0 ? (
        <div className="text-center py-24 bg-card/20 rounded-xl border border-dashed border-white/10">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium mb-2">No clips found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {search || statusFilter !== 'all' || formatFilter !== 'all' 
              ? "Try adjusting your filters to see more results." 
              : "Generate some clips from your projects first."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredClips?.map((clip) => (
            <Link key={clip.id} href={`/clips/${clip.id}`}>
              <div className="group relative rounded-xl border border-white/5 bg-card overflow-hidden hover:border-primary/50 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] flex flex-col h-full">
                {/* Thumbnail Area */}
                <div className="aspect-[9/16] bg-black relative overflow-hidden">
                  {clip.thumbnailUrl ? (
                    <img 
                      src={clip.thumbnailUrl} 
                      alt={clip.title} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105" 
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-card to-background">
                      <Play className="h-10 w-10 text-white/10" />
                    </div>
                  )}
                  
                  {/* Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40 pointer-events-none" />
                  
                  <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                    <Badge variant="secondary" className="bg-black/60 backdrop-blur-md uppercase text-[10px] border-none">
                      {clip.format}
                    </Badge>
                    <div className="flex flex-col items-end gap-1.5">
                      {clip.viralScore && (
                        <Badge className="bg-primary shadow-[0_0_10px_rgba(139,92,246,0.5)] font-mono border-none">
                          {clip.viralScore}/100
                        </Badge>
                      )}
                      <StatusIndicator status={clip.status} />
                    </div>
                  </div>

                  {/* Play Button Overlay on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <div className="h-12 w-12 rounded-full bg-primary/90 text-white flex items-center justify-center backdrop-blur-sm shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                      <Play className="h-5 w-5 ml-1" />
                    </div>
                  </div>
                  
                  <div className="absolute bottom-3 left-3 right-3">
                    {clip.duration && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/80 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur mb-2">
                        <Clock className="h-3 w-3" /> {formatDuration(clip.duration)}
                      </span>
                    )}
                    <h4 className="font-semibold text-white leading-tight line-clamp-2 shadow-sm">
                      {clip.title}
                    </h4>
                  </div>
                </div>
                
                {/* Details Area */}
                <div className="p-3 bg-card border-t border-white/5">
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-1 font-medium">
                    {clip.projectTitle}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 line-clamp-1 italic">
                    {clip.hookText || "Auto-generated captions included"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: ClipStatus }) {
  switch (status) {
    case "ready":
      return null; // Don't clutter if ready
    case "rendering":
      return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] uppercase backdrop-blur animate-pulse">Rendering</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-[10px] uppercase backdrop-blur">Failed</Badge>;
    default:
      return <Badge variant="secondary" className="bg-white/10 text-[10px] uppercase backdrop-blur">Pending</Badge>;
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
