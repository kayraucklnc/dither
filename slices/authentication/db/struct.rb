# frozen_string_literal: true

require "hanami/db/struct"

module Authentication
  module DB
    # The application database base struct.
    class Struct < Dither::DB::Struct
    end
  end
end
