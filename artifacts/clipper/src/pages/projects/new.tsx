import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateProject, ProjectInputVideoSource, ProjectInputCategory, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, Link as LinkIcon, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).optional(),
  videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  videoSource: z.nativeEnum(ProjectInputVideoSource),
  category: z.nativeEnum(ProjectInputCategory).optional(),
  language: z.string().optional(),
}).refine(data => data.videoSource === 'url' ? !!data.videoUrl : true, {
  message: "Video URL is required when source is URL",
  path: ["videoUrl"]
});

type FormValues = z.infer<typeof formSchema>;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      videoUrl: "",
      videoSource: "url",
      category: "podcast",
      language: "id",
    },
  });

  const onSubmit = (data: FormValues) => {
    createProject.mutate(
      { data },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast.success("Project created successfully");
          setLocation(`/projects/${project.id}`);
        },
        onError: () => {
          toast.error("Failed to create project");
        }
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Project</h1>
          <p className="text-muted-foreground text-sm">Upload a video or paste a link to start clipping.</p>
        </div>
      </div>

      <Card className="bg-card/40 border-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Source Video</CardTitle>
          <CardDescription>Provide the long-form video you want to analyze.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="videoSource"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Tabs 
                        value={field.value} 
                        onValueChange={(val) => {
                          field.onChange(val);
                          if (val === 'upload') {
                            form.setValue('videoUrl', '');
                            form.clearErrors('videoUrl');
                          }
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid w-full max-w-md grid-cols-2 bg-black/40">
                          <TabsTrigger value="url" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                            <LinkIcon className="h-4 w-4 mr-2" />
                            YouTube Link
                          </TabsTrigger>
                          <TabsTrigger value="upload" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                            <UploadCloud className="h-4 w-4 mr-2" />
                            Upload File
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="url" className="mt-4">
                          <FormField
                            control={form.control}
                            name="videoUrl"
                            render={({ field: urlField }) => (
                              <FormItem>
                                <FormLabel>Video URL</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://youtube.com/watch?v=..." className="bg-black/20 font-mono" {...urlField} />
                                </FormControl>
                                <FormDescription>
                                  Supports YouTube, Twitch, and direct MP4/M3U8 links.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TabsContent>
                        
                        <TabsContent value="upload" className="mt-4">
                          <div className="border-2 border-dashed border-white/10 rounded-xl p-10 flex flex-col items-center justify-center bg-black/20 hover:bg-black/40 hover:border-primary/50 transition-colors cursor-pointer group">
                            <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors group-hover:text-primary">
                              <UploadCloud className="h-6 w-6" />
                            </div>
                            <p className="font-medium mb-1">Click to upload or drag and drop</p>
                            <p className="text-xs text-muted-foreground">MP4, MOV, WEBM up to 2GB</p>
                            {/* Dummy file input since this is a mockup */}
                            <Input type="file" className="hidden" accept="video/*" />
                          </div>
                        </TabsContent>
                      </Tabs>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="h-px bg-white/5 w-full my-6" />

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Project Title</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g. Joe Rogan #1999" className="bg-black/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="podcast">Podcast</SelectItem>
                          <SelectItem value="gaming">Gaming</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="interview">Interview</SelectItem>
                          <SelectItem value="vlog">Vlog</SelectItem>
                          <SelectItem value="comedy">Comedy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Spoken Language</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="id">Indonesian</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="pt">Portuguese</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Notes / Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Add any context for the AI..." 
                          className="bg-black/20 resize-none h-20" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  disabled={createProject.isPending}
                  className="w-full md:w-auto shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                >
                  {createProject.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Project"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
