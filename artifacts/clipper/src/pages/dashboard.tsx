import { useGetDashboardStats, useGetTopClips, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, Scissors, Activity, Play, Zap } from "lucide-react";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: topClips, isLoading: clipsLoading } = useGetTopClips();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your AI processing and generated clips.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Projects" 
          value={stats?.totalProjects} 
          icon={FolderKanban} 
          isLoading={statsLoading} 
        />
        <StatCard 
          title="Total Clips" 
          value={stats?.totalClips} 
          icon={Scissors} 
          isLoading={statsLoading} 
        />
        <StatCard 
          title="Avg. Viral Score" 
          value={stats?.avgViralScore} 
          suffix="/100"
          icon={Zap} 
          isLoading={statsLoading} 
          valueClassName="text-primary drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]"
        />
        <StatCard 
          title="Top Score" 
          value={stats?.topViralScore} 
          suffix="/100"
          icon={Activity} 
          isLoading={statsLoading} 
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Viral Clips</CardTitle>
              <CardDescription>Highest scoring clips across all projects</CardDescription>
            </div>
            <Link href="/clips" className="text-sm text-primary hover:underline underline-offset-4">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {clipsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
              </div>
            ) : topClips?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No clips generated yet. Process a project first!
              </div>
            ) : (
              <div className="space-y-4">
                {topClips?.map((clip) => (
                  <Link 
                    key={clip.id} 
                    href={`/clips/${clip.id}`}
                    className="flex items-center gap-4 rounded-lg border border-white/5 bg-black/20 p-3 transition-all hover:bg-white/5 hover:border-white/10 group cursor-pointer"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {clip.thumbnailUrl ? (
                        <img src={clip.thumbnailUrl} alt={clip.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/40">
                          <Play className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="truncate text-sm font-medium leading-none group-hover:text-primary transition-colors">
                        {clip.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {clip.projectTitle}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30 font-mono">
                        {clip.viralScore} / 100
                      </Badge>
                      <span className="text-[10px] text-muted-foreground uppercase">{clip.format}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest processing updates</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
              </div>
            ) : recentActivity?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recent activity.
              </div>
            ) : (
              <div className="space-y-6">
                {recentActivity?.map((activity, i) => (
                  <div key={`${activity.type ?? 'item'}-${activity.id}-${i}`} className="relative flex gap-4">
                    {i !== recentActivity.length - 1 && (
                      <div className="absolute left-2.5 top-6 bottom-0 w-px -translate-x-1/2 bg-border" />
                    )}
                    <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black mt-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.title}
                      </p>
                      {activity.subtitle && (
                        <p className="text-sm text-muted-foreground">
                          {activity.subtitle}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(activity.timestamp).toLocaleDateString()} {new Date(activity.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, isLoading, suffix = "", valueClassName = "" }: any) {
  return (
    <Card className="bg-card/40 backdrop-blur border-white/5 hover:bg-card/60 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={`text-2xl font-bold font-mono tracking-tight ${valueClassName}`}>
            {value !== undefined ? `${value}${suffix}` : "-"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
