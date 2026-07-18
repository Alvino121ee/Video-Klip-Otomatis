import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetProject, 
  useProcessProject, 
  useListProjectClips, 
  useListProjectMoments,
  ProjectStatus,
  getGetProjectQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Play, Cpu, AlertCircle, Clock, CheckCircle2, ChevronRight, Zap, RefreshCw, Loader2, Scissors, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function ProjectDetail() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);

  const { data: project, isLoading: projectLoading } = useGetProject(id, { 
    query: { 
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id),
      refetchInterval: (query) => query.state.data?.status === 'processing' ? 3000 : false
    } 
  });
  
  const { data: clips, isLoading: clipsLoading } = useListProjectClips(id, { query: { enabled: !!id, queryKey: ['/api/projects', id, 'clips'] as const } });
  const { data: moments, isLoading: momentsLoading } = useListProjectMoments(id, { query: { enabled: !!id, queryKey: ['/api/projects', id, 'moments'] as const } });
  
  const processProject = useProcessProject();

  const handleProcess = (options: any) => {
    processProject.mutate(
      { id, data: options },
      {
        onSuccess: (updatedProject) => {
          queryClient.setQueryData(getGetProjectQueryKey(id), updatedProject);
          setIsProcessDialogOpen(false);
          toast.success("AI Processing started!");
        },
        onError: () => {
          toast.error("Failed to start processing");
        }
      }
    );
  };

  if (projectLoading) {
    return <ProjectDetailSkeleton />;
  }

  if (!project) {
    return <div className="text-center py-20">Project not found</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon" className="rounded-full mt-1 shrink-0 hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{project.title}</h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              {project.description || "No description provided."}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground font-mono">
              {project.duration && (
                <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(project.duration)}
                </span>
              )}
              {project.category && (
                <span className="capitalize bg-white/5 px-2 py-1 rounded">{project.category}</span>
              )}
              {project.language && (
                <span className="uppercase bg-white/5 px-2 py-1 rounded">{project.language}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {project.status === "pending" || project.status === "failed" ? (
            <ProcessDialog 
              open={isProcessDialogOpen} 
              onOpenChange={setIsProcessDialogOpen} 
              onProcess={handleProcess}
              isPending={processProject.isPending}
            />
          ) : project.status === "processing" ? (
            <Button disabled variant="outline" className="border-primary/50 text-primary bg-primary/10">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Processing ({project.processingProgress || 0}%)
            </Button>
          ) : (
            <ProcessDialog 
              open={isProcessDialogOpen} 
              onOpenChange={setIsProcessDialogOpen} 
              onProcess={handleProcess}
              isPending={processProject.isPending}
              triggerText="Reprocess"
            />
          )}
        </div>
      </div>

      {/* Error State */}
      {project.status === 'failed' && project.errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 flex gap-4 items-start">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive text-sm mb-1">Gagal memproses video</p>
            <p className="text-sm text-muted-foreground">{project.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Processing State Overlay */}
      {project.status === 'processing' && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 md:p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          <Cpu className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <h3 className="text-xl font-semibold mb-2 text-primary">AI is analyzing video...</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 text-sm">
            Our models are transcribing audio, analyzing emotional peaks, and finding the most viral moments.
          </p>
          <div className="max-w-md mx-auto space-y-2 text-left">
            <div className="flex justify-between text-xs font-mono text-primary/80">
              <span>Overall Progress</span>
              <span>{project.processingProgress || 0}%</span>
            </div>
            <Progress value={project.processingProgress || 0} className="h-2 bg-black/40" />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Video Preview */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden shadow-xl sticky top-6">
            <div className="aspect-video bg-black relative flex items-center justify-center group">
              {project.thumbnailUrl ? (
                <>
                  <img src={project.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button size="icon" className="h-12 w-12 rounded-full bg-white/20 hover:bg-primary/80 backdrop-blur text-white border border-white/30 transition-transform group-hover:scale-110">
                      <Play className="h-5 w-5 ml-1" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground p-6">
                  <Play className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Video Preview Unavailable</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-card/60 backdrop-blur">
              <h3 className="font-medium text-sm mb-2 text-muted-foreground uppercase tracking-wider">Source Details</h3>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source:</span>
                  <span className="truncate max-w-[150px]" title={project.videoUrl || ""}>
                    {project.videoSource === 'url' ? project.videoUrl : 'Local Upload'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Clips & Moments */}
        <div className="lg:col-span-2">
          {project.status !== 'processing' && project.status !== 'pending' && (
            <Tabs defaultValue="clips" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-black/40 border border-white/5 mb-6">
                <TabsTrigger value="clips" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Generated Clips
                  {clips && clips.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary text-[10px] px-1.5 py-0">
                      {clips.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="moments" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  Viral Moments Timeline
                  {moments && moments.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary text-[10px] px-1.5 py-0">
                      {moments.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="clips" className="space-y-4 focus-visible:outline-none">
                {clipsLoading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl bg-card/40" />)}
                  </div>
                ) : !clips || clips.length === 0 ? (
                  <div className="text-center py-16 bg-card/20 rounded-xl border border-dashed border-white/10">
                    <Scissors className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-1">No clips generated yet</h3>
                    <p className="text-sm text-muted-foreground">Start processing to extract viral clips.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {clips.map(clip => (
                      <Link key={clip.id} href={`/clips/${clip.id}`}>
                        <div className="group relative rounded-xl border border-white/5 bg-card/40 overflow-hidden hover:border-primary/50 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] flex flex-col h-full">
                          <div className="aspect-[9/16] bg-black relative overflow-hidden sm:aspect-[4/5]">
                            {clip.thumbnailUrl ? (
                              <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black via-black/80 to-transparent">
                                <Play className="h-8 w-8 text-white/20" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
                            
                            <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                              <Badge className="bg-primary/80 backdrop-blur-md font-mono border-none shadow-lg">
                                {clip.viralScore}/100
                              </Badge>
                              {clip.format && (
                                <Badge variant="secondary" className="bg-black/60 backdrop-blur-md uppercase text-[10px] border-none">
                                  {clip.format}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="absolute bottom-3 left-3 right-3">
                              <h4 className="font-semibold text-white leading-tight line-clamp-2 mb-1 group-hover:text-primary-foreground transition-colors drop-shadow-md">
                                {clip.title}
                              </h4>
                              {clip.duration && (
                                <p className="text-xs font-mono text-white/70 flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {formatDuration(clip.duration)}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="p-3 bg-black/40 text-xs text-muted-foreground flex items-center justify-between border-t border-white/5">
                            <span className="line-clamp-1">{clip.hookText || "Auto-generated caption..."}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-white/20 group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="moments" className="space-y-4 focus-visible:outline-none">
                {momentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl bg-card/40" />)}
                  </div>
                ) : !moments || moments.length === 0 ? (
                  <div className="text-center py-16 bg-card/20 rounded-xl border border-dashed border-white/10">
                    <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-1">No moments detected</h3>
                    <p className="text-sm text-muted-foreground">The AI didn't find any high-value moments in this video.</p>
                  </div>
                ) : (
                  <div className="relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent space-y-6 py-4">
                    {moments.sort((a, b) => a.startTime - b.startTime).map((moment) => (
                      <div key={moment.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-card text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 group-hover:border-primary/50 group-hover:bg-primary group-hover:text-primary-foreground">
                          <Zap className="h-4 w-4" />
                        </div>
                        
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/5 bg-card/40 hover:bg-card/60 transition-colors shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className="font-mono text-[10px] bg-black/40 border-white/10">
                              {formatDuration(moment.startTime)} - {formatDuration(moment.endTime)}
                            </Badge>
                            <Badge className="bg-primary/20 text-primary hover:bg-primary/30 font-mono shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                              Score: {moment.viralScore}
                            </Badge>
                          </div>
                          
                          <p className="text-sm font-medium mb-1 capitalize text-white/90">
                            {moment.momentType} Moment
                          </p>
                          
                          {moment.transcript && (
                            <p className="text-xs text-muted-foreground line-clamp-2 italic border-l-2 border-primary/30 pl-2 ml-1 my-2">
                              "{moment.transcript}"
                            </p>
                          )}
                          
                          {moment.selectionReason && (
                            <p className="text-xs text-muted-foreground/70 mt-2">
                              {moment.selectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500/20 text-green-400 border-transparent"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Badge>;
    case "processing":
      return <Badge className="bg-primary/20 text-primary border-transparent animate-pulse"><Cpu className="mr-1 h-3 w-3" /> Processing</Badge>;
    case "failed":
      return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-transparent"><AlertCircle className="mr-1 h-3 w-3" /> Failed</Badge>;
    default:
      return <Badge variant="secondary" className="bg-white/10 text-muted-foreground border-transparent"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
  }
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ProcessDialog({ open, onOpenChange, onProcess, isPending, triggerText = "Start AI Processing" }: any) {
  const [targetFormats, setTargetFormats] = useState<string[]>(["shorts", "reels", "tiktok"]);
  const [clipDurations, setClipDurations] = useState<number[]>([30, 60]);
  const [subtitleStyle, setSubtitleStyle] = useState("highlight");
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [enableAutoReframe, setEnableAutoReframe] = useState(true);

  const handleSubmit = () => {
    onProcess({
      targetFormats,
      clipDurations,
      subtitleStyle,
      enableSubtitles,
      enableAutoReframe,
      maxClips: 10
    });
  };

  const toggleFormat = (format: string) => {
    setTargetFormats(prev => 
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    );
  };

  const toggleDuration = (duration: number) => {
    setClipDurations(prev => 
      prev.includes(duration) ? prev.filter(d => d !== duration) : [...prev, duration]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shadow-[0_0_15px_rgba(139,92,246,0.3)]">
          <Cpu className="mr-2 h-4 w-4" />
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle>Configure AI Processing</DialogTitle>
          <DialogDescription>
            Customize how our AI analyzes and generates clips from your video.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="space-y-3">
            <Label>Target Formats</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "shorts", label: "YT Shorts" },
                { id: "reels", label: "IG Reels" },
                { id: "tiktok", label: "TikTok" },
                { id: "square", label: "Square (1:1)" }
              ].map(format => (
                <Badge
                  key={format.id}
                  variant="outline"
                  className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                    targetFormats.includes(format.id) 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-black/20 hover:bg-white/10"
                  }`}
                  onClick={() => toggleFormat(format.id)}
                >
                  {format.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Target Durations</Label>
            <div className="flex flex-wrap gap-2">
              {[15, 30, 45, 60, 90].map(duration => (
                <Badge
                  key={duration}
                  variant="outline"
                  className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                    clipDurations.includes(duration) 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-black/20 hover:bg-white/10"
                  }`}
                  onClick={() => toggleDuration(duration)}
                >
                  {duration}s
                </Badge>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="subtitles">Auto-Generate Subtitles</Label>
              <p className="text-xs text-muted-foreground">Burn dynamic captions into the video</p>
            </div>
            <Switch id="subtitles" checked={enableSubtitles} onCheckedChange={setEnableSubtitles} />
          </div>

          {enableSubtitles && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
              <Label>Subtitle Style</Label>
              <Select value={subtitleStyle} onValueChange={setSubtitleStyle}>
                <SelectTrigger className="bg-black/20">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="highlight">Highlight (Alex Hormozi style)</SelectItem>
                  <SelectItem value="karaoke">Karaoke</SelectItem>
                  <SelectItem value="word_by_word">Word by Word</SelectItem>
                  <SelectItem value="pop">Pop & Bounce</SelectItem>
                  <SelectItem value="glow">Neon Glow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reframe">AI Auto-Reframe</Label>
              <p className="text-xs text-muted-foreground">Keep speakers centered in vertical formats</p>
            </div>
            <Switch id="reframe" checked={enableAutoReframe} onCheckedChange={setEnableAutoReframe} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || targetFormats.length === 0 || clipDurations.length === 0}>
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</> : "Start Processing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[400px] rounded-xl" />
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
