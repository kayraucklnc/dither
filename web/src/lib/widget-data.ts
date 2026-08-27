import { answersEnsuring } from "@/lib/extensions/fetcher";
import { answersFor, observationKey } from "@/lib/extensions/observations";

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
