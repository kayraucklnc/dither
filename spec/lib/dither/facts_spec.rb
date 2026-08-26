# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Facts do
  describe ".declared" do
    it "reads declared facts" do
      extension = Factory[:extension, facts: [
        {"key" => "next_meeting_in", "label" => "Next meeting starts in",
         "type" => "duration", "path" => "source_1.next.minutes"}
      ]]

      expect(described_class.declared(extension).map(&:key)).to eq %w[next_meeting_in]
    end

    it "drops a fact with no path, which could never answer anything" do
      extension = Factory[:extension, facts: [{"key" => "broken", "type" => "text"}]]

      expect(described_class.declared(extension)).to be_empty
    end

    it "offers only operators that make sense for the type", :aggregate_failures do
      extension = Factory[:extension, facts: [
        {"key" => "minutes", "type" => "duration", "path" => "a.b"},
        {"key" => "place", "type" => "text", "path" => "a.c"}
      ]]
      duration, text = described_class.declared extension

      expect(duration.operators.map(&:id)).to include("lt")
      expect(duration.operators.map(&:id)).not_to include("contains")
      expect(text.operators.map(&:id)).to include("contains")
      expect(text.operators.map(&:id)).not_to include("lt")
    end
  end

  describe ".value" do
    it "digs a dotted path" do
      data = {"source_1" => {"next" => {"minutes" => 12}}}

      expect(described_class.value(data, "source_1.next.minutes")).to eq 12
    end

    it "answers nil for a path that is not there" do
      expect(described_class.value({"a" => 1}, "a.b.c")).to be_nil
    end
  end

  describe ".compare" do
    it "compares numbers", :aggregate_failures do
      expect(described_class.compare(12, "lt", 30)).to be true
      expect(described_class.compare(45, "lt", 30)).to be false
      expect(described_class.compare(30, "lte", 30)).to be true
    end

    it "compares text", :aggregate_failures do
      expect(described_class.compare("Milan Office", "contains", "office")).to be true
      expect(described_class.compare("Home", "contains", "office")).to be false
    end

    it "answers presence", :aggregate_failures do
      expect(described_class.compare("Office", "present", nil)).to be true
      expect(described_class.compare("", "present", nil)).to be false
      expect(described_class.compare(nil, "absent", nil)).to be true
    end

    it "does not hold when there is no value to compare" do
      expect(described_class.compare(nil, "lt", 30)).to be false
    end
  end
end
