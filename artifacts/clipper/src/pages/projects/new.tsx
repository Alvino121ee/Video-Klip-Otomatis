import { useState, useRef, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { UploadCloud, Link as LinkIcon, ArrowLeft, Loader2, FileVideo, CheckCircle2, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formSchema = z.object({
  title: z.string().min(1, "Judul wajib diisi").max(100),
  description: z.string().max(500).optional(),
  videoUrl: z.string().url("Harus URL yang valid").optional().or(z.literal("")),
  videoSource: z.nativeEnum(ProjectInputVideoSource),
  category: z.nativeEnum(ProjectInputCategory).optional(),
  language: z.string().optional(),
}).refine(data => data.videoSource === "url" ? !!data.videoUrl : true, {
  message: "Video URL wajib diisi jika source adalah URL",
  path: ["videoUrl"],
});

type FormValues = z.infer<typeof formSchema>;

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function NewProject() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      videoUrl: "",
      videoSource: "upload",
      category: "podcast",
      language: "id",
    },
  });

  const videoSource = form.watch("videoSource");

  // ── Drag & drop handlers ────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setSelectedFile(file);
      if (!form.getValues("title")) {
        form.setValue("title", file.name.replace(/\.[^/.]+$/, ""));
      }
    } else {
      toast.error("Hanya file video yang didukung (MP4, MOV, WebM, MKV).");
    }
  }, [form]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!form.getValues("title")) {
        form.setValue("title", file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  // ── Upload video lewat XHR (untuk progress bar) ─────────────────
  const uploadFile = (file: File, fields: FormValues): Promise<{ id: number }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", fields.title);
      formData.append("language", fields.language ?? "id");
      formData.append("category", fields.category ?? "podcast");
      formData.append("description", fields.description ?? "");
      formData.append("maxClips", "8");
      formData.append("clipDurations", JSON.stringify([30, 60]));
      formData.append("enableSubtitles", "true");
      formData.append("subtitleStyle", "highlight");

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          const msg = JSON.parse(xhr.responseText)?.error ?? "Upload gagal";
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Koneksi gagal saat upload."));
      xhr.open("POST", `${BASE_URL}/api/upload`);
      xhr.send(formData);
    });
  };

  // ── Submit handler ───────────────────────────────────────────────
  const onSubmit = async (data: FormValues) => {
    if (data.videoSource === "upload") {
      if (!selectedFile) {
        toast.error("Pilih file video terlebih dahulu.");
        return;
      }
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const project = await uploadFile(selectedFile, data);
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast.success("Video berhasil diupload! AI sedang memproses...");
        setLocation(`/projects/${project.id}`);
      } catch (err: any) {
        toast.error(err.message ?? "Upload gagal. Coba lagi.");
        setIsUploading(false);
      }
      return;
    }

    // YouTube URL flow
    createProject.mutate(
      { data },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast.success("Project berhasil dibuat");
          setLocation(`/projects/${project.id}`);
        },
        onError: () => toast.error("Gagal membuat project"),
      }
    );
  };

  const isLoading = createProject.isPending || isUploading;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Project Baru</h1>
          <p className="text-muted-foreground text-sm">Upload video atau tempel link YouTube untuk mulai membuat klip.</p>
        </div>
      </div>

      <Card className="bg-card/40 border-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Sumber Video</CardTitle>
          <CardDescription>Pilih video panjang yang ingin kamu analisis dengan AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* Tab pilih sumber */}
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
                          if (val === "url") {
                            setSelectedFile(null);
                          } else {
                            form.setValue("videoUrl", "");
                            form.clearErrors("videoUrl");
                          }
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid w-full max-w-md grid-cols-2 bg-black/40">
                          <TabsTrigger value="upload" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                            <UploadCloud className="h-4 w-4 mr-2" />
                            Upload File
                          </TabsTrigger>
                          <TabsTrigger value="url" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                            <LinkIcon className="h-4 w-4 mr-2" />
                            YouTube Link
                          </TabsTrigger>
                        </TabsList>

                        {/* ── Tab Upload ── */}
                        <TabsContent value="upload" className="mt-4">
                          {selectedFile ? (
                            <div className="border border-primary/30 rounded-xl p-5 flex items-center gap-4 bg-primary/5">
                              <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <FileVideo className="h-6 w-6 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{selectedFile.name}</p>
                                <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-8 w-8 hover:bg-destructive/20 hover:text-destructive flex-shrink-0"
                                onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                                isDragging
                                  ? "border-primary/60 bg-primary/10"
                                  : "border-white/10 bg-black/20 hover:bg-black/40 hover:border-primary/50"
                              }`}
                            >
                              <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-4 transition-colors ${isDragging ? "bg-primary/30 text-primary" : "bg-white/5 group-hover:bg-primary/20"}`}>
                                <UploadCloud className="h-6 w-6" />
                              </div>
                              <p className="font-medium mb-1">Klik untuk pilih atau drag & drop video</p>
                              <p className="text-xs text-muted-foreground">MP4, MOV, WebM, MKV — maks 2 GB</p>
                            </div>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleFileSelect}
                          />

                          {/* Progress upload */}
                          {isUploading && (
                            <div className="mt-4 space-y-2">
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>{uploadProgress < 100 ? "Mengupload..." : "Memproses..."}</span>
                                <span>{uploadProgress}%</span>
                              </div>
                              <Progress value={uploadProgress} className="h-2" />
                            </div>
                          )}
                        </TabsContent>

                        {/* ── Tab URL ── */}
                        <TabsContent value="url" className="mt-4">
                          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 mb-4 text-sm text-yellow-400/80">
                            ⚠️ Download YouTube dari server cloud sering diblokir. Gunakan <strong>Upload File</strong> untuk hasil lebih andal.
                          </div>
                          <FormField
                            control={form.control}
                            name="videoUrl"
                            render={({ field: urlField }) => (
                              <FormItem>
                                <FormLabel>URL YouTube</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://youtube.com/watch?v=..." className="bg-black/20 font-mono" {...urlField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TabsContent>
                      </Tabs>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="h-px bg-white/5 w-full" />

              {/* Detail project */}
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Judul Project</FormLabel>
                      <FormControl>
                        <Input placeholder="Nama project kamu" className="bg-black/20" {...field} />
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
                      <FormLabel>Kategori</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20">
                            <SelectValue placeholder="Pilih kategori" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="podcast">Podcast</SelectItem>
                          <SelectItem value="gaming">Gaming</SelectItem>
                          <SelectItem value="tutorial">Tutorial</SelectItem>
                          <SelectItem value="education">Edukasi</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="interview">Interview</SelectItem>
                          <SelectItem value="news">Berita</SelectItem>
                          <SelectItem value="streaming">Streaming</SelectItem>
                          <SelectItem value="vlog">Vlog</SelectItem>
                          <SelectItem value="comedy">Komedi</SelectItem>
                          <SelectItem value="sports">Olahraga</SelectItem>
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
                      <FormLabel>Bahasa Video</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20">
                            <SelectValue placeholder="Pilih bahasa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="id">Indonesia</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="ja">日本語</SelectItem>
                          <SelectItem value="ko">한국어</SelectItem>
                          <SelectItem value="zh">中文</SelectItem>
                          <SelectItem value="ar">العربية</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
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
                      <FormLabel>Catatan / Deskripsi (Opsional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tambahkan konteks untuk AI..."
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
                  disabled={isLoading}
                  className="w-full md:w-auto shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isUploading ? `Mengupload ${uploadProgress}%...` : "Memproses..."}
                    </>
                  ) : videoSource === "upload" ? (
                    <>
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Upload & Proses Video
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Buat Project
                    </>
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
