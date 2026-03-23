export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resp = await fetch("https://api.github.com/repos/hiroshi75/paper", {
      headers: {
        "User-Agent": "AAES-Registry",
        Accept: "application/vnd.github.v3+json",
      },
    });
    const body = await resp.json() as Record<string, unknown>;
    return Response.json({
      status: resp.ok ? "ok" : "error",
      httpStatus: resp.status,
      name: body.full_name,
      private: body.private,
      has_discussions: body.has_discussions,
      message: body.message,
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return Response.json({ status: "echo", body });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
