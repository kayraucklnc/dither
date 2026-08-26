# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Scenes", :db do
  describe "composer" do
    it "renders the layout picker with every layout" do
      visit routes.path(:scene_new)

      expect(page).to have_css(".layout-option", count: Terminus::Composition::LAYOUTS.size)
    end

    it "renders a drop target per slot of the chosen layout" do
      visit routes.path(:scene_new, layout: "quadrants")

      expect(page).to have_css(".slot-target", count: 4)
    end

    it "defaults to the full page layout" do
      visit routes.path(:scene_new)

      expect(page).to have_css(".slot-target", count: 1)
    end

    it "advertises the shapes each extension declares", :aggregate_failures do
      Factory[:extension, label: "Weather", variants: {"quarter" => "<div>q</div>"}]
      visit routes.path(:scene_new)

      expect(page).to have_css(%(.palette-item[data-shapes="full quarter"]))
      expect(page).to have_css(".shape-chip", text: "Quarter")
    end
  end

  describe "preview" do
    it "refuses a shape the extension never declared" do
      extension = Factory[:extension]

      visit "#{routes.path :scene_preview}?layout=quadrants&slots[top_left]=#{extension.id}"

      # Asserted on the raw body: the endpoint answers an image or a JSON
      # problem, never HTML, so Capybara has no DOM to search.
      expect(page.body).to include "no quarter design"
    end

    it "answers the rendered panel as an image" do
      model = Factory[:model, width: 800, height: 480]
      extension = Factory[:extension, template: "<div class=\"screen\">Hi</div>"]

      visit "#{routes.path :scene_preview}?layout=full&model_id=#{model.id}" \
            "&slots[main]=#{extension.id}"

      expect(page.body[0, 8].bytes).to start_with 0x89, 0x50, 0x4e, 0x47
    end
  end
end
