import { NextResponse } from "next/server";
import { getSourceItemsByIds } from "@/lib/content-pool";
import { getGeneratedPost, makeGeneratedPostVersion } from "@/lib/generated-posts";
import { generateImagesFromPrompt } from "@/lib/image-generation";
import { generatePost } from "@/lib/openai";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { GeneratedPost, ImageGenerationQuality, NormalizedSourceItem, ProductionPlan, SourceImageTask } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      post?: GeneratedPost;
      source?: NormalizedSourceItem;
      materialPaths?: string[];
      instruction?: string;
      productionPlanOverride?: ProductionPlan;
      imageTasks?: SourceImageTask[];
      generateImages?: boolean;
      imageSize?: string;
      imageQuality?: ImageGenerationQuality;
    };
    if (!body.post) return NextResponse.json({ error: "Post is required" }, { status: 400 });
    const currentPost = await getGeneratedPost(body.post.id, account);
    if (!currentPost) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const source = (await getSourceItemsByIds([currentPost.sourceItemId], account))[0];
    if (!source) return NextResponse.json({ error: "Source item is required" }, { status: 400 });

    const nextPost = await generatePost({
      source,
      materialPaths: Array.isArray(body.materialPaths) ? body.materialPaths : currentPost.materialPaths,
      instruction: body.instruction || "重新生成一个差异化版本，保留事实信息，调整标题钩子、段落节奏和表达角度。",
      productionPlanOverride: body.productionPlanOverride || currentPost.productionPlanOverride,
      imageTasks: Array.isArray(body.imageTasks) ? body.imageTasks : currentPost.imageTasks,
    });

    if (body.generateImages !== false) {
      const imageResult = await generateImagesFromPrompt(nextPost.imagePrompt, 1, nextPost.imageTasks, {
        size: body.imageSize,
        quality: body.imageQuality,
      });
      nextPost.imageUrls = imageResult.imageUrls;
      nextPost.aiNotes = [...nextPost.aiNotes, `再次生成版本，配图返回 ${imageResult.imageUrls.length} 张。`];
    }

    const post = await makeGeneratedPostVersion(currentPost, nextPost, account);
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate post" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
