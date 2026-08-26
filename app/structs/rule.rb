# frozen_string_literal: true

module Dither
  module Structs
    # The rule struct.
    class Rule < DB::Struct
      def condition = Conditions.kind condition_kind

      def condition_label = Conditions.describe condition_kind, settings

      # Written out rather than using the shorthand: a trailing `now:` on a
      # paren-less call passes the symbol, not the value.
      def holds? device, now: Time.now
        Conditions.holds? condition_kind, device, settings, now: now
      end

      def always? = condition_kind == Conditions::DEFAULT

      # Reads as one sentence in the rule list, which is the point: a rule you
      # cannot read at a glance is a rule you cannot trust with a panel.
      def sentence
        base = "Show #{scene ? scene.label : "a deleted scene"} #{condition_label}"

        refresh_rate ? "#{base}, refreshing every #{refresh_rate / 60} min" : base
      end
    end
  end
end
