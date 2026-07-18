import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, ProjectStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Video, Clock, Film } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function ProjectsList() {
  const [search, setSearch] = useState("");
  const { data: projects, isLoading } = useListProjects();

  const filteredProjects = projects?.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage your source videos and processing queues.</p>
        </div>
        <Link href="/projects/new">
          <Button className="shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search projects..."
            className="pl-8 bg-black/20 border-white/10 focus-visible:ring-primary/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 w-full rounded-xl bg-card/40" />
          ))}
        </div>
      ) : filteredProjects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-xl bg-card/10">
          <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No projects found</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            {search ? "No projects match your search criteria." : "You haven't uploaded any videos yet. Create a new project to start clipping."}
          </p>
          {!search && (
            <Link href="/projects/new">
              <Button variant="outline">Create your first project</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects?.map(project => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="overflow-hidden hover:border-primary/50 transition-colors bg-card/40 border-white/5 cursor-pointer group flex flex-col h-full">
                <div className="relative aspect-video bg-black/60 overflow-hidden">
                  {project.thumbnailUrl ? (
                    <img 
                      src={project.thumbnailUrl} 
                      alt={project.title} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300 group-hover:scale-105" 
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Video className="h-10 w-10 text-white/10" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={project.status} />
                  </div>
                  {project.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-mono font-medium backdrop-blur-md">
                      {formatDuration(project.duration)}
                    </div>
                  )}
                </div>
                <CardContent className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                    {project.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 mb-4 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Film className="h-3 w-3" />
                      {project.clipCount || 0} clips
                    </span>
                  </div>
                  
                  <div className="mt-auto">
                    {project.status === "processing" ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-mono text-primary">
                          <span>Processing</span>
                          <span>{project.processingProgress || 0}%</span>
                        </div>
                        <Progress value={project.processingProgress || 0} className="h-1.5 bg-primary/20" />
                      </div>
                    ) : project.status === "failed" ? (
                      <div className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded truncate">
                        {project.errorMessage || "Processing failed"}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {project.category && (
                          <Badge variant="secondary" className="bg-white/5 text-muted-foreground capitalize text-[10px]">
                            {project.category}
                          </Badge>
                        )}
                        {project.language && (
                          <Badge variant="secondary" className="bg-white/5 text-muted-foreground uppercase text-[10px]">
                            {project.language}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]">Ready</Badge>;
    case "processing":
      return <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/20 animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.2)]">Processing</Badge>;
    case "failed":
      return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]">Failed</Badge>;
    default:
      return <Badge variant="secondary" className="bg-white/10 hover:bg-white/20">Pending</Badge>;
  }
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
