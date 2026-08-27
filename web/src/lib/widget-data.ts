import { answersEnsuring } from "@/lib/extensions/fetcher";
import { answersFor, observationKey } from "@/lib/extensions/observations";
import type { Extension } from "@/lib/extensions/registry";

/**
 * The data a widget draws with, and whether it is any good.
 *
 * Looked up by what the widget *asks* - its extension and its settings - not by
 * which widget it is. Two widgets configured the same share one answer and one
 * fetch, and a source watching the same thing shares it too.
 *
 * The fault travels with the payload rather than being dropped here. It used to
 * be dropped, and the cost was the worst kind of bug: a Google project with the
 * Calendar API switched off rendered a panel full of the extension's *sample* -
 * four plausible meetings, none of them real - and said nothing anywhere a
 * person looking at the panel could see it. Whatever is drawn has to be able to
 * say how much it is worth.
 */
export interface WidgetData {
  payload: Record<string, unknown>;
  /** What the last attempt failed with, if it failed. */
  problem?: string;
  /** True while this is the extension's sample rather than a real answer. */
  standIn: boolean;
}

export async function dataFor(
  requests: { id: number; extension: string; settings: Record<string, unknown> }[],
  /**
   * Ask for anything never answered, rather than falling back to the
   * extension's sample. On for anything a person is looking at: a sample that
   * contradicts the settings just typed reads as a bug.
   */
  options: { ensure?: boolean } = {},
): Promise<Map<number, WidgetData>> {
  const answers = options.ensure
    ? await answersEnsuring(requests)
    : await answersFor(requests);

  return new Map(
    requests.map((request) => {
      const answer = answers.get(observationKey(request.extension, request.settings));

      return [
        request.id,
        {
          payload: answer?.payload ?? {},
          problem: answer?.error,
          standIn: answer?.standIn ?? true,
        },
      ];
    }),
  );
}

/**
 * What a *preview* draws with: the real answer where there is one, the
 * extension's sample where there is not.
 *
 * A thumbnail is a picture rather than a decision, so the sample is allowed
 * here - it is the whole reason the catalogue can be browsed before anyone
 * owns an API key. But it is a fallback, not a preference. A card showing what
 * your gallery actually holds beats one showing what a gallery might hold, and
 * the gallery's sample is empty on purpose, so without this its card would say
 * "no pictures yet" to somebody with two hundred.
 *
 * Asking for an answer nobody has yet is only done where answering costs a
 * directory read. Opening the catalogue must not fire eight HTTP requests at
 * eight providers.
 */
export async function previewData(
  extension: Extension,
  settings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const question = [{ extension: extension.name, settings }];
  const local = extension.manifest.kind === "gallery";

  const answers = local ? await answersEnsuring(question) : await answersFor(question);
  const answer = answers.get(observationKey(extension.name, settings));

  return answer && !answer.standIn
    ? answer.payload
    : (extension.manifest.sample as Record<string, unknown>);
}
