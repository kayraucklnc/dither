# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Extension preview rendering", :db do
  subject(:generator) { Hanami.app["aspects.extensions.generator"] }

  let(:model) { Factory[:model, width: 800, height: 480] }

  it "falls back to sample data when nothing has been fetched" do
    extension = Factory[:extension,
                        template: "<p>{{ source_1.label }}</p>",
                        sample: {"source_1" => {"label" => "Sampled"}}]

    result = generator.call extension, model_id: model.id, preview: true

    expect(result.value!).to include "Sampled"
  end

  it "does not use sample data outside a preview" do
    extension = Factory[:extension,
                        template: "<p>{{ source_1.label }}</p>",
                        sample: {"source_1" => {"label" => "Sampled"}}]

    result = generator.call extension, model_id: model.id

    expect(result.value!).not_to include "Sampled"
  end

  it "prefers real data over the sample" do
    extension = Factory[:extension,
                        template: "<p>{{ source_1.label }}</p>",
                        sample: {"source_1" => {"label" => "Sampled"}}]
    Factory[:extension_exchange, extension_id: extension.id,
            data: {"source_1" => {"label" => "Live"}}]

    result = generator.call extension, model_id: model.id, preview: true

    expect(result.value!).to include("Live").and(satisfy { !it.include? "Sampled" })
  end
end
