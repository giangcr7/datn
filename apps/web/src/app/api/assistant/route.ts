import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import {
  canAccessWorkspacePath,
  type WorkspaceUser,
} from "@/lib/workspace-access";
import {
  answerDiplomaQuestion,
  assistantConfig,
  AssistantRequestError,
  checkAssistantOrigin,
  readBoundedJson,
  reserveAssistantRequest,
  validateAssistantQuestion,
} from "@/lib/assistant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    checkAssistantOrigin(request, process.env.NEXTAUTH_URL);
    const session = (await getServerSession(authOptions)) as {
      user?: WorkspaceUser;
      error?: string;
    } | null;
    const user = session?.error ? undefined : session?.user;
    const staff =
      !!user &&
      !user.mustChangePassword &&
      canAccessWorkspacePath(user, "/import");
    let config;
    try {
      config = assistantConfig();
    } catch {
      throw new AssistantRequestError(
        503,
        "Trợ lý chưa được cấu hình đầy đủ. Vui lòng dùng hướng dẫn và các chức năng chính.",
      );
    }
    release = reserveAssistantRequest(user?.id, config.dailyLimit);
    const input = validateAssistantQuestion(await readBoundedJson(request));
    if (input.context && !staff)
      throw new AssistantRequestError(
        403,
        "Giải thích lỗi hồ sơ chỉ dành cho cán bộ được phân quyền kiểm tra dữ liệu.",
      );
    const answer = await answerDiplomaQuestion(
      input,
      staff,
      config,
      request.signal,
    );
    return NextResponse.json(
      { success: true, ...answer },
      { headers: responseHeaders },
    );
  } catch (error) {
    const expected = error instanceof AssistantRequestError;
    const status = expected ? error.status : 503;
    const headers: Record<string, string> = { ...responseHeaders };
    if (expected && error.retryAfter)
      headers["Retry-After"] = String(error.retryAfter);
    return NextResponse.json(
      {
        success: false,
        error: expected
          ? error.message
          : "Trợ lý tạm chưa sẵn sàng. Vui lòng thử lại sau.",
      },
      { status, headers },
    );
  } finally {
    release?.();
  }
}
