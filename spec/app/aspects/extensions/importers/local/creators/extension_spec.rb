# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Importers::Local::Creators::Extension, :db do
  subject(:creator) { described_class.new }

  include_context "with application dependencies"

  describe "#call" do
    let(:repository) { Terminus::Repositories::Extension.new }

    let :attributes do
      {
        name: "test",
        label: "Test",
        description: "A test.",
        mode: "text",
        kind: "poll",
        tags: ["test"],
        static_body: {
          a: 1
        },
        template: "<h1>Test</h1>",
        fields: [
          {
            name: "one",
            label: "One"
          }
        ],
        data: {
          a: 1
        },
        interval: 1,
        unit: "minute",
        days: [],
        last_day_of_month: false,
        start_at: "2025-01-01T00:00:00+00:00"
      }
    end

    it "creates extension" do
      creator.call attributes

      expect(repository.all.first).to have_attributes(
        name: "test",
        label: "Test",
        description: "A test.",
        mode: "text",
        kind: "poll",
        tags: ["test"],
        static_body: {"a" => 1},
        template: "<h1>Test</h1>",
        fields: [
          {"name" => "one", "label" => "One"}
        ],
        data: {"a" => 1},
        interval: 1,
        unit: "minute",
        days: [],
        last_day_of_month: false,
        start_at: kind_of(Time)
      )
    end

    it "logs import" do
      creator.call attributes
      expect(logger.reread).to match(/DEBUG.+Imported extension\..+extension_id.+\d+/)
    end

    it "adds job schedule" do
      creator.call attributes
      expect(Hanami.app[:sidekiq].get_schedule["extension-test"]).to be_a(Hash)
    end

    it "answers extension when success" do
      expect(creator.call(attributes)).to match(Success(kind_of(Terminus::Structs::Extension)))
    end

    it "fails when missing attribute" do
      attributes.delete :name
      expect(creator.call(attributes)).to be_failure("Extension name is missing.")
    end

    it "answers failure when not unique" do
      creator.call attributes
      expect(creator.call(attributes)).to match(Failure(/must be unique/))
    end
  end
end
