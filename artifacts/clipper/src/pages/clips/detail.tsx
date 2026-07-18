import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetClip, useUpdateClip, useExportClip, ClipStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetClipQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, Play, Download, Share2, Type, Sparkles, Hash, 
  BarChart3, RefreshCw, CheckCircle2, ChevronRight, Settings2, Smartphone,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export default function ClipDetail() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");

  const { data: clip, isLoading } = useGetClip(id, { 
    query: { 
      enabled: !!id,
      queryKey: getGetClipQueryKey(id),
      refetchInterval: (query) => 
        (query.state.data?.status === 'pending' || query.state.data?.status === 'rendering') ? 2000 : false
    } 
  });

  const updateClip = useUpdateClip();
  const exportClip = useExportClip();

  // Keep local state in sync with server state for form controls
  const [subtitleStyle, setSubtitleStyle] = useState<string>("highlight");
  const [hasSubtitles, setHasSubtitles] = useState<boolean>(true);
  const [isAutoReframed, setIsAutoReframed] = useState<boolean>(true);
  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (clip && initializedForId.current !== id) {
      setEditedTitle(clip.title);
      setSubtitleStyle(clip.subtitleStyle || "highlight");
      setHasSubtitles(clip.hasSubtitles ?? true);
      setIsAutoReframed(clip.isAutoReframed ?? true);
      initializedForId.current = id;
    }
  }, [clip, id]);

  const handleSaveTitle = () => {
    if (editedTitle.trim() === clip?.title || !editedTitle.trim()) {
      setIsEditingTitle(false);
      setEditedTitle(clip?.title || "");
      return;
    }

    updateClip.mutate(
      { id, data: { title: editedTitle.trim() } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetClipQueryKey(id), updated);
          setIsEditingTitle(false);
          toast.success("Title updated");
        }
      }
    );
  };

  const handleStyleChange = (key: 'subtitleStyle' | 'hasSubtitles' | 'isAutoReframed', value: any) => {
    if (key === 'subtitleStyle') setSubtitleStyle(value);
    if (key === 'hasSubtitles') setHasSubtitles(value);
    if (key === 'isAutoReframed') setIsAutoReframed(value);

    // Optimistic update
    updateClip.mutate(
      { id, data: { [key]: value } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetClipQueryKey(id), updated);
          toast.success("Settings saved");
        }
      }
    );
  };

  const handleExport = () => {
    exportClip.mutate(
      { id, data: { format: clip?.format || "shorts", quality: "1080p" } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetClipQueryKey(id), updated);
          toast.success("Render queued. This might take a minute.");
        }
      }
    );
  };

  if (isLoading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-card/40 rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5"><div className="aspect-[9/16] bg-card/40 rounded-2xl" /></div>
        <div className="lg:col-span-7 space-y-4">
          <div className="h-10 w-3/4 bg-card/40 rounded" />
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-card/40 rounded-xl" />)}</div>
        </div>
      </div>
    </div>
  );
  if (!clip) return <div className="text-center py-20">Clip not found</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <Link href={`/projects/${clip.projectId}`}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </Link>
        <StatusBadge status={clip.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Player (Span 5) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl mx-auto max-w-[350px] lg:max-w-none">
            {/* The actual player aspect ratio depends on format, defaulting to 9:16 for shorts/reels/tiktok */}
            <div className={`w-full relative ${clip.format === 'square' ? 'aspect-square' : 'aspect-[9/16]'}`}>
              {clip.thumbnailUrl ? (
                <>
                  <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-transparent transition-colors group cursor-pointer">
                    <div className="h-16 w-16 rounded-full bg-primary/90 text-white flex items-center justify-center backdrop-blur-sm shadow-[0_0_30px_rgba(139,92,246,0.6)] transform group-hover:scale-110 transition-transform">
                      <Play className="h-6 w-6 ml-1" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-card/50">
                  {clip.status === 'rendering' ? (
                    <>
                      <RefreshCw className="h-8 w-8 animate-spin mb-4 text-primary" />
                      <p>Rendering Video...</p>
                    </>
                  ) : (
                    <>
                      <Play className="h-12 w-12 mb-4 opacity-20" />
                      <p>Preview Unavailable</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Simulated subtitle overlay if enabled */}
            {hasSubtitles && clip.hookText && clip.thumbnailUrl && clip.status !== 'rendering' && (
              <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 flex justify-center pointer-events-none px-4">
                <span className={`text-center font-bold text-xl sm:text-2xl drop-shadow-md px-3 py-1 rounded
                  ${subtitleStyle === 'highlight' ? 'bg-primary/90 text-white' : ''}
                  ${subtitleStyle === 'karaoke' ? 'text-white' : ''}
                  ${subtitleStyle === 'glow' ? 'text-white drop-shadow-[0_0_10px_rgba(139,92,246,1)]' : ''}
                  ${subtitleStyle === 'pop' ? 'text-white bg-black/60' : ''}
                `}>
                  {clip.hookText.split(' ').slice(0, 5).join(' ')}...
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-center max-w-[350px] lg:max-w-none mx-auto">
            <Button 
              className="flex-1 shadow-[0_0_15px_rgba(139,92,246,0.2)]" 
              disabled={clip.status === 'rendering' || clip.status === 'pending' || exportClip.isPending}
              onClick={handleExport}
            >
              {exportClip.isPending || clip.status === 'rendering' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {clip.status === 'rendering' ? 'Rendering...' : 'Export & Download'}
            </Button>
            <Button variant="secondary" size="icon" className="shrink-0 bg-white/5 hover:bg-white/10" disabled={clip.status !== 'ready'}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Column: Details & Settings (Span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Title Area */}
          <div className="group relative">
            {isEditingTitle ? (
              <div className="flex gap-2">
                <Input
                  ref={titleRef}
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  onBlur={handleSaveTitle}
                  className="text-2xl font-bold h-12 bg-black/20"
                  autoFocus
                />
                <Button onClick={handleSaveTitle} size="icon" className="h-12 w-12 shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <h1 
                className="text-2xl md:text-3xl font-bold tracking-tight cursor-text hover:text-primary/90 transition-colors inline-block"
                onClick={() => setIsEditingTitle(true)}
              >
                {clip.title}
              </h1>
            )}
            <p className="text-muted-foreground mt-2 font-mono text-sm flex items-center gap-2">
              From: <Link href={`/projects/${clip.projectId}`} className="text-primary hover:underline">{clip.projectTitle}</Link>
              <span className="text-white/20">•</span>
              {formatDuration(clip.duration || 0)}
              <span className="text-white/20">•</span>
              <span className="uppercase">{clip.format}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ScoreCard label="Viral Score" score={clip.viralScore} color="primary" icon={Sparkles} />
            <ScoreCard label="Engagement" score={clip.engagementScore} color="blue" icon={BarChart3} />
            <ScoreCard label="Retention" score={clip.retentionScore} color="green" icon={Clock} />
            <ScoreCard label="Confidence" score={clip.confidenceScore} color="purple" icon={CheckCircle2} />
          </div>

          <Tabs defaultValue="metadata" className="w-full mt-8">
            <TabsList className="grid w-full grid-cols-2 bg-black/40 border border-white/5">
              <TabsTrigger value="metadata" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                Metadata & Social
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                Edit & Styling
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="metadata" className="space-y-6 pt-4">
              <div className="rounded-xl border border-white/5 bg-card/40 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" /> Suggested Title
                  </h3>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 text-sm">
                    {clip.suggestedTitle || "No title suggestion available"}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Hash className="h-4 w-4 text-primary" /> Viral Hashtags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {clip.suggestedHashtags?.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="bg-white/5 hover:bg-white/10 text-xs">
                        #{tag}
                      </Badge>
                    )) || <span className="text-sm text-muted-foreground italic">Generating hashtags...</span>}
                  </div>
                </div>

                {clip.hookText && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Type className="h-4 w-4 text-primary" /> Opening Hook
                    </h3>
                    <p className="text-sm italic border-l-2 border-primary/50 pl-3 ml-1">
                      "{clip.hookText}"
                    </p>
                  </div>
                )}

                {clip.selectionReason && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-primary" /> AI Reasoning
                    </h3>
                    <p className="text-sm text-muted-foreground bg-black/20 p-3 rounded-lg">
                      {clip.selectionReason}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6 pt-4">
              <div className="rounded-xl border border-white/5 bg-card/40 p-5 space-y-6">
                
                <div className="flex flex-row items-center justify-between rounded-lg bg-black/20 p-4 border border-white/5">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Type className="h-4 w-4 text-primary" />
                      Dynamic Subtitles
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Burn generated captions into the video.
                    </p>
                  </div>
                  <Switch 
                    checked={hasSubtitles} 
                    onCheckedChange={(val) => handleStyleChange('hasSubtitles', val)} 
                  />
                </div>

                {hasSubtitles && (
                  <div className="space-y-3 px-1 animate-in fade-in">
                    <Label className="text-muted-foreground">Subtitle Style</Label>
                    <Select 
                      value={subtitleStyle} 
                      onValueChange={(val) => handleStyleChange('subtitleStyle', val)}
                    >
                      <SelectTrigger className="bg-black/20 border-white/10 h-12">
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="highlight">Highlight (Default)</SelectItem>
                        <SelectItem value="karaoke">Karaoke</SelectItem>
                        <SelectItem value="word_by_word">Word by Word</SelectItem>
                        <SelectItem value="pop">Pop & Bounce</SelectItem>
                        <SelectItem value="glow">Neon Glow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="h-px bg-white/5" />

                <div className="flex flex-row items-center justify-between rounded-lg bg-black/20 p-4 border border-white/5">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-primary" />
                      AI Auto-Reframe
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Keep the active speaker centered in the frame.
                    </p>
                  </div>
                  <Switch 
                    checked={isAutoReframed} 
                    onCheckedChange={(val) => handleStyleChange('isAutoReframed', val)} 
                  />
                </div>

                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4 flex items-start gap-3">
                  <Settings2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-primary/90">
                    Changing these settings will require re-rendering the clip before export.
                  </p>
                </div>

              </div>
            </TabsContent>

          </Tabs>

        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, color, icon: Icon }: any) {
  if (score === undefined || score === null) return null;
  
  return (
    <div className="bg-card/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group">
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-${color}-500`} />
      <Icon className={`h-5 w-5 mb-2 text-muted-foreground group-hover:text-${color}-400 transition-colors`} />
      <span className={`text-2xl font-bold font-mono tracking-tighter`}>{score}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ClipStatus }) {
  switch (status) {
    case "ready":
      return <Badge className="bg-green-500/20 text-green-400 border-transparent shadow-[0_0_10px_rgba(34,197,94,0.2)]">Ready to Export</Badge>;
    case "rendering":
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-transparent animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)]"><RefreshCw className="mr-1.5 h-3 w-3 animate-spin inline" /> Rendering</Badge>;
    case "failed":
      return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-transparent">Failed</Badge>;
    default:
      return <Badge variant="secondary" className="bg-white/10 text-muted-foreground border-transparent">Processing</Badge>;
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
