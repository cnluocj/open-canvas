import { useState, useCallback } from "react";
import { Source } from "../types";
import { useToast } from "./use-toast";
import { fileToBase64, extractWordText } from "../lib/attachments";

const SOURCES_NAMESPACE = ["sources"];
const MAX_SOURCES = 50;

export function useSources() {
  const { toast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load sources from LangGraph Store
  const loadSources = useCallback(async (threadId: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/store/get", {
        method: "POST",
        body: JSON.stringify({
          namespace: SOURCES_NAMESPACE,
          key: threadId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        console.error("Failed to get sources", res.statusText, res.status);
        return;
      }

      const { item } = await res.json();
      if (item?.value?.sources) {
        setSources(item.value.sources.map((s: Source) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        })));
      }
    } catch (error) {
      console.error("Error loading sources:", error);
      toast({
        title: "加载来源失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Save sources to LangGraph Store
  const saveSources = useCallback(async (
    threadId: string,
    updatedSources: Source[]
  ): Promise<void> => {
    try {
      const res = await fetch("/api/store/put", {
        method: "POST",
        body: JSON.stringify({
          namespace: SOURCES_NAMESPACE,
          key: threadId,
          value: {
            sources: updatedSources,
          },
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to save sources");
      }
    } catch (error) {
      console.error("Error saving sources:", error);
      toast({
        title: "保存来源失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Add a new source from file upload
  const addFileSource = useCallback(async (
    threadId: string,
    files: File[]
  ): Promise<void> => {
    if (sources.length + files.length > MAX_SOURCES) {
      toast({
        title: "来源数量超限",
        description: `最多只能添加 ${MAX_SOURCES} 个来源`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Process each file
      const newSources: Source[] = await Promise.all(
        files.map(async (file) => {
          let content: string;

          // Handle different file types
          if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
            // For PDF, store as base64
            content = await fileToBase64(file);
          } else if (
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.type === "application/msword" ||
            file.name.endsWith(".docx") ||
            file.name.endsWith(".doc")
          ) {
            // Extract text from Word documents
            content = await extractWordText(file);
          } else {
            // For text files, read as text
            content = await file.text();
          }

          return {
            id: crypto.randomUUID(),
            name: file.name,
            type: "file" as const,
            createdAt: new Date(),
            enabled: true,
            content: content,
            metadata: {
              size: file.size,
              fileType: file.type,
            },
          };
        })
      );

      const updatedSources = [...sources, ...newSources];
      setSources(updatedSources);
      await saveSources(threadId, updatedSources);

      toast({
        title: "添加成功",
        description: `已添加 ${newSources.length} 个文件来源`,
      });
    } catch (error) {
      console.error("Error adding file source:", error);
      toast({
        title: "添加文件失败",
        description: "请检查文件格式和大小",
        variant: "destructive",
      });
    }
  }, [sources, saveSources, toast]);

  // Add a new source from link
  const addLinkSource = useCallback(async (
    threadId: string,
    url: string
  ): Promise<void> => {
    if (sources.length >= MAX_SOURCES) {
      toast({
        title: "来源数量超限",
        description: `最多只能添加 ${MAX_SOURCES} 个来源`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Scrape the web page using Firecrawl API
      const res = await fetch("/api/firecrawl/scrape", {
        method: "POST",
        body: JSON.stringify({ url }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to scrape URL");
      }

      const { content, title } = await res.json();

      const newSource: Source = {
        id: crypto.randomUUID(),
        name: title || url,
        type: "link",
        createdAt: new Date(),
        enabled: true,
        content: content,
        metadata: {
          url: url,
          title: title,
        },
      };

      const updatedSources = [...sources, newSource];
      setSources(updatedSources);
      await saveSources(threadId, updatedSources);

      toast({
        title: "添加成功",
        description: "已添加网站来源",
      });
    } catch (error) {
      console.error("Error adding link source:", error);
      toast({
        title: "添加网站失败",
        description: "请检查URL是否有效",
        variant: "destructive",
      });
    }
  }, [sources, saveSources, toast]);

  // Add a new source from text
  const addTextSource = useCallback(async (
    threadId: string,
    text: string,
    name?: string
  ): Promise<void> => {
    if (sources.length >= MAX_SOURCES) {
      toast({
        title: "来源数量超限",
        description: `最多只能添加 ${MAX_SOURCES} 个来源`,
        variant: "destructive",
      });
      return;
    }

    const newSource: Source = {
      id: crypto.randomUUID(),
      name: name || `文本 ${new Date().toLocaleString()}`,
      type: "text",
      createdAt: new Date(),
      enabled: true,
      content: text,
    };

    const updatedSources = [...sources, newSource];
    setSources(updatedSources);
    await saveSources(threadId, updatedSources);

    toast({
      title: "添加成功",
      description: "已添加文本来源",
    });
  }, [sources, saveSources, toast]);

  // Remove a source
  const removeSource = useCallback(async (
    threadId: string,
    sourceId: string
  ): Promise<void> => {
    const updatedSources = sources.filter((s) => s.id !== sourceId);
    setSources(updatedSources);
    await saveSources(threadId, updatedSources);

    toast({
      title: "删除成功",
      description: "来源已删除",
    });
  }, [sources, saveSources, toast]);

  // Toggle source enabled/disabled
  const toggleSource = useCallback(async (
    threadId: string,
    sourceId: string
  ): Promise<void> => {
    const updatedSources = sources.map((s) =>
      s.id === sourceId ? { ...s, enabled: !s.enabled } : s
    );
    setSources(updatedSources);
    await saveSources(threadId, updatedSources);
  }, [sources, saveSources]);

  // Get enabled sources count
  const enabledSourcesCount = sources.filter((s) => s.enabled).length;

  return {
    sources,
    isLoading,
    loadSources,
    addFileSource,
    addLinkSource,
    addTextSource,
    removeSource,
    toggleSource,
    enabledSourcesCount,
    maxSources: MAX_SOURCES,
  };
}
