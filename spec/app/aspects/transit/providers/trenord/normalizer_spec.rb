# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Transit::Providers::Trenord::Normalizer do
  subject(:normalizer) { described_class.new now: -> { now } }

  # 22:30 in Europe/Rome, which is the wall clock Trenord quotes.
  let(:now) { Time.utc 2026, 8, 26, 20, 30, 0 }

  let :settings do
    Terminus::Aspects::Transit::Settings[
      origin: "MILANO CERTOSA",
      destination: "MILANO PORTA GARIBALDI",
      timezone: "Europe/Rome",
      transfers: 1
    ]
  end
  # A train close to departure: Trenord ships its whole run, typed O/F/D, with
  # platforms and real times filled in.
  let :live_solution do
    {
      "date" => "20260826",
      "dep_time" => "22:43:00",
      "arr_time" => "22:58:00",
      "duration" => "00:15:00",
      "change" => "0",
      "delay" => 5,
      "cancelled" => false,
      "dep_day_offset" => 0,
      "dep_station" => station("S01640", "MILANO CERTOSA"),
      "arr_station" => station("S01645", "MILANO PORTA GARIBALDI"),
      "journey_list" => [
        {
          "train" => {
            "line" => "S5",
            "train_name" => "11881",
            "direction" => "PIOLTELLO LIMITO",
            "delay" => 5,
            "status" => "V",
            "has_live_info" => true
          },
          "pass_list" => [
            {
              "type" => "O",
              "station" => station("S01205", "VARESE"),
              "dep_time" => "21:46:00",
              "dep_date_time" => "2026-08-26T19:46:00.000Z",
              "platform" => "1",
              "is_actual_platform" => true,
              "actual_data" => {"dep_actual_time" => "21:50:00", "dep_delay_actual" => 4}
            },
            {
              "type" => "F",
              "station" => station("S01640", "MILANO CERTOSA"),
              "dep_time" => "22:43:00",
              "dep_date_time" => "2026-08-26T20:43:00.000Z",
              "platform" => "2",
              "is_actual_platform" => true,
              "actual_data" => {"dep_actual_time" => "22:48:00", "dep_delay_actual" => 5}
            }
          ]
        }
      ]
    }
  end
  # A train hours away: only the legs of your own journey, typed start/pass/end,
  # with no platform and no live data.
  let :scheduled_solution do
    {
      "date" => "20260827",
      "dep_time" => "05:45:00",
      "arr_time" => "06:53:00",
      "duration" => "01:08:00",
      "change" => "2",
      "delay" => nil,
      "cancelled" => false,
      "dep_day_offset" => 1,
      "dep_station" => station("S01640", "MILANO CERTOSA"),
      "arr_station" => station("S01066", "MILANO CADORNA"),
      "journey_list" => [
        {
          "train" => {
            "line" => "S5",
            "train_name" => "11813",
            "direction" => "PIOLTELLO LIMITO",
            "delay" => nil,
            "has_live_info" => false
          },
          "pass_list" => [
            {
              "type" => "start",
              "station" => station("S01640", "MILANO CERTOSA"),
              "dep_time" => "05:45:00",
              "dep_date_time" => "2026-08-27T03:45:00.000Z",
              "actual_data" => {}
            }
          ]
        }
      ]
    }
  end
  let(:payload) { {"solutions" => [live_solution, scheduled_solution]} }

  def station code, name
    {"station_id" => code, "station_ori_name" => name}
  end

  describe "#call" do
    it "answers origin and destination from the payload" do
      board = normalizer.call payload, settings

      expect(board).to have_attributes(
        origin: "MILANO CERTOSA",
        destination: "MILANO PORTA GARIBALDI",
        provider: "trenord",
        city: "milan",
        queried_at: "22:30"
      )
    end

    it "answers a live departure with its real time and platform" do
      departure = normalizer.call(payload, settings).departures.first

      expect(departure).to have_attributes(
        line: "S5",
        number: "11881",
        direction: "PIOLTELLO LIMITO",
        scheduled: "22:43",
        expected: "22:48",
        delay: 5,
        platform: "2",
        platform_actual: true,
        arrival: "22:58",
        duration: "15m",
        changes: 0,
        live: true,
        cancelled: false
      )
    end

    it "answers a scheduled departure without live detail" do
      departure = normalizer.call(payload, settings).departures.last

      expect(departure).to have_attributes(
        number: "11813",
        scheduled: "05:45",
        expected: "05:45",
        delay: 0,
        platform: nil,
        duration: "1h08",
        changes: 2,
        live: false,
        day_offset: 1
      )
    end

    it "shifts the expected time by the delay when there is no live time" do
      solution = scheduled_solution.merge "delay" => 20
      board = normalizer.call({"solutions" => [solution]}, settings)

      expect(board.departures.first.expected).to eq("06:05")
    end

    it "wraps the expected time past midnight" do
      solution = scheduled_solution.merge "dep_time" => "23:50:00", "delay" => 20
      board = normalizer.call({"solutions" => [solution]}, settings)

      expect(board.departures.first.expected).to eq("00:10")
    end

    it "drops a train that has already left" do
      departed = live_solution.merge "dep_time" => "22:00:00"
      departed["journey_list"][0]["pass_list"][1] =
        departed["journey_list"][0]["pass_list"][1].merge(
          "dep_date_time" => "2026-08-26T20:00:00.000Z"
        )

      board = normalizer.call({"solutions" => [departed]}, settings)

      expect(board.departures).to be_empty
    end

    it "drops a train that leaves within the lead time" do
      board = normalizer.call payload, settings.with(lead_time: 30)

      expect(board.departures.map(&:number)).to contain_exactly("11813")
    end

    it "answers a cancelled train by its status" do
      cancelled = live_solution.dup
      cancelled["journey_list"] = [
        cancelled["journey_list"][0].merge(
          "train" => cancelled["journey_list"][0]["train"].merge("status" => "S")
        )
      ]

      board = normalizer.call({"solutions" => [cancelled]}, settings)

      expect(board.departures.first).to have_attributes(cancelled: true, status: "CANCELLED")
    end

    it "hides cancelled trains when asked" do
      cancelled = live_solution.merge "cancelled" => true
      board = normalizer.call({"solutions" => [cancelled]}, settings.with(hide_cancelled: true))

      expect(board.departures).to be_empty
    end

    it "honors the limit" do
      board = normalizer.call payload, settings.with(limit: 1)

      expect(board.departures.map(&:number)).to contain_exactly("11881")
    end

    it "answers alerts as plain text in the chosen language" do
      alerts = [
        {
          "severity" => "WARNING",
          "title_en" => "Notice",
          "title_it" => "Avviso",
          "message_en" => "<div><strong>Bus </strong>replacement\n  between stops.</div>",
          "message_it" => "<div>Autobus sostitutivi.</div>"
        }
      ]

      board = normalizer.call payload.merge("hafas_alerts" => alerts), settings

      expect(board.alerts.first).to have_attributes(
        severity: "WARNING",
        title: "Notice",
        message: "Bus replacement between stops."
      )
    end

    it "answers Italian alerts when asked" do
      alerts = [{"severity" => "INFO", "title_it" => "Avviso", "message_it" => "<p>Ciao.</p>"}]
      board = normalizer.call payload.merge("hafas_alerts" => alerts), settings.with(language: "it")

      expect(board.alerts.first.message).to eq("Ciao.")
    end

    it "answers an empty board without solutions" do
      board = normalizer.call({"solutions" => []}, settings)

      expect(board).to have_attributes(
        empty?: true,
        origin: "MILANO CERTOSA",
        destination: "MILANO PORTA GARIBALDI"
      )
    end
  end
end
