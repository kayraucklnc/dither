# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Dashboard", :db do
  it "lists IP addresses" do
    visit routes.path(:root)

    expect(page).to have_css("li", text: /\d+\.\d+\.\d+/)
  end

  it "renders when there is no firmware" do
    visit routes.path(:root)

    expect(page).to have_text("Dashboard")
  end

  it "tells you what to do when no device has connected yet" do
    visit routes.path(:root)

    expect(page).to have_text("No devices yet")
  end

  it "leads with device health once a device exists" do
    model = Factory[:model, label: "Waveshare", width: 800, height: 480]
    Factory[:device, model_id: model.id, label: "Hallway"]

    visit routes.path(:root)

    aggregate_failures do
      expect(page).to have_text("Hallway")
      expect(page).to have_text("Last seen")
    end
  end

  it "links the library with its counts", :aggregate_failures do
    visit routes.path(:root)

    expect(page).to have_link("0", href: routes.path(:scenes))
    expect(page).to have_link("0", href: routes.path(:extensions))
    expect(page).to have_link("0", href: routes.path(:models))
    expect(page).to have_link("1", href: routes.path(:users))
  end

  it "shows the endpoint a device should be pointed at" do
    visit routes.path(:root)

    expect(page).to have_css("#dash-api-uri")
  end
end
