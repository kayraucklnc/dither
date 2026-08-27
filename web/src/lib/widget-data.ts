import { answersEnsuring } from "@/lib/extensions/fetcher";
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
  /**
   * Ask for anything never answered, rather than falling back to the
   * extension's sample. On for anything a person is looking at: a sample that
   * contradicts the settings just typed reads as a bug.
   */
  options: { ensure?: boolean } = {},
): Promise<Map<number, Record<string, unknown>>> {
  const answers = options.ensure
    ? await answersEnsuring(requests)
    : await answersFor(requests);

  return new Map(
    requests.map((request) => [
      request.id,
      answers.get(observationKey(request.extension, request.settings))?.payload ?? {},
    ]),
  );
}
