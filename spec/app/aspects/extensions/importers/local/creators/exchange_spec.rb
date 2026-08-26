# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Importers::Local::Creators::Exchange, :db do
  subject(:creator) { described_class.new }

  include_context "with application dependencies"

  describe "#call" do
    let(:extension) { Factory[:extension] }
    let(:repository) { Terminus::Repositories::ExtensionExchange.new }

    let :attributes do
      {
        extension_id: extension.id,
        headers: {content_type: "application/json"},
        verb: "get",
        body: {sort: "desc"},
        template: "https://test.io"
      }
    end

    it "creates exchange" do
      creator.call attributes

      expect(repository.all.first).to have_attributes(
        extension_id: extension.id,
        headers: {"content_type" => "application/json"},
        verb: "get",
        body: {"sort" => "desc"},
        template: "https://test.io"
      )
    end

    it "logs import" do
      creator.call attributes
      expect(logger.reread).to match(
        /DEBUG.+Imported extension exchange\..+extension_id.+\d+.+exchange_id.+\d+/
      )
    end

    it "enqueues job" do
      Sidekiq::Testing.fake! do
        creator.call attributes

        expect(Terminus::Jobs::Extensions::ExchangeRefresh.jobs).to contain_exactly(
          hash_including("args" => [kind_of(Integer)])
        )
      end
    end

    it "answers extension when success" do
      expect(creator.call(attributes)).to match(
        Success(kind_of(Terminus::Structs::ExtensionExchange))
      )
    end

    it "fails when missing attribute" do
      attributes.delete :verb
      expect(creator.call(attributes)).to be_failure("Exchange verb is missing.")
    end
  end
end
