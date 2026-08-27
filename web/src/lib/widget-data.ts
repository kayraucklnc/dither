import { answersFor, observationKey } from "@/lib/extensions/observations";

/**
 * The data a widget draws with.
 *
 * Looked up by what the widget *asks* - its extension and its settings - not by
 * which widget it is. Two widgets configured the same share one answer and one
 * fetch, and a source watching the same thing shares it too.
 */
export async function dataFor(
  requests: { id: number; extension: string; settings: Record<string, unknown> }[],
): Promise<Map<number, Record<string, unknown>>> {
  const answers = await answersFor(requests);

  return new Map(
    requests.map((request) => [
      request.id,
      answers.get(observationKey(request.extension, request.settings))?.payload ?? {},
    ]),
  );
}
