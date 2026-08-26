# frozen_string_literal: true

module Dither
  module Relations
    # The user status relation.
    class UserStatus < DB::Relation
      schema :user_status, infer: true
    end
  end
end
