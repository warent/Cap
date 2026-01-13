import { provideOptionalAuth, S3Buckets, Videos } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { Effect, Option } from "effect";
import { NextResponse } from "next/server";
import { runPromise } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const videoId = id as Video.VideoId;

	try {
		const result = await Effect.gen(function* () {
			const videos = yield* Videos;
			const [video] = yield* videos.getByIdForViewing(videoId).pipe(
				Effect.flatten,
				Effect.catchTag("NoSuchElementException", () =>
					Effect.fail(new Error("Not found")),
				),
			);

			const [s3] = yield* S3Buckets.getBucketAccess(video.bucketId);
			const mp4Key = `${video.ownerId}/${video.id}/result.mp4`;
			const signedUrl = yield* s3.getSignedObjectUrl(mp4Key);

			return { signedUrl, video };
		}).pipe(provideOptionalAuth, runPromise);

		const videoResponse = await fetch(result.signedUrl);

		if (!videoResponse.ok) {
			return new NextResponse("Failed to fetch video", { status: 502 });
		}

		return new NextResponse(videoResponse.body, {
			status: 200,
			headers: {
				"Content-Type": "video/mp4",
				"Content-Length": videoResponse.headers.get("Content-Length") || "",
				"Cache-Control": "public, max-age=31536000",
			},
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Not found") {
			return new NextResponse("Video not found", { status: 404 });
		}
		return new NextResponse("Internal server error", { status: 500 });
	}
}
