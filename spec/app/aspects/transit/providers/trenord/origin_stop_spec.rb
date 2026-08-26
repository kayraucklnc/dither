# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Transit::Providers::Trenord::OriginStop do
  subject(:origin_stop) { described_class }

  def stop code, name
    {"station" => {"station_id" => code, "station_ori_name" => name}, "platform" => code}
  end

  describe ".call" do
    it "answers the stop matching the departure station" do
      solution = {
        "dep_station" => {"station_id" => "S01640"},
        "journey_list" => [
          {"pass_list" => [stop("S01205", "VARESE"), stop("S01640", "MILANO CERTOSA")]}
        ]
      }

      expect(origin_stop.call(solution)["station"]["station_ori_name"]).to eq("MILANO CERTOSA")
    end

    it "answers the first stop when nothing matches" do
      solution = {
        "dep_station" => {"station_id" => "S99999"},
        "journey_list" => [{"pass_list" => [stop("S01205", "VARESE")]}]
      }

      expect(origin_stop.call(solution)["station"]["station_ori_name"]).to eq("VARESE")
    end

    it "answers empty hash without a journey" do
      expect(origin_stop.call({})).to eq({})
    end
  end
end
