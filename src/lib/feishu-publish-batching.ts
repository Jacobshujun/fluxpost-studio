export const feishuRecordBatchSize = 10;

export function countFeishuPublishChunks(itemCount: number) {
  return Math.ceil(Math.max(0, Math.floor(itemCount)) / feishuRecordBatchSize);
}

export function chunkFeishuPublishItems<T>(items: T[]) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += feishuRecordBatchSize) {
    chunks.push(items.slice(index, index + feishuRecordBatchSize));
  }
  return chunks;
}

export type FeishuPublishChunkOutcome<T> = {
  chunk: T[];
  chunkIndex: number;
  chunkCount: number;
  error?: unknown;
};

export async function processFeishuPublishChunks<T>(
  items: T[],
  processChunk: (chunk: T[], chunkIndex: number, chunkCount: number) => Promise<void>,
  onChunkSettled: (outcome: FeishuPublishChunkOutcome<T>) => Promise<void>,
) {
  const chunks = chunkFeishuPublishItems(items);
  for (const [chunkIndex, chunk] of chunks.entries()) {
    let error: unknown;
    try {
      await processChunk(chunk, chunkIndex, chunks.length);
    } catch (caught) {
      error = caught;
    }
    await onChunkSettled({ chunk, chunkIndex, chunkCount: chunks.length, error });
  }
}
