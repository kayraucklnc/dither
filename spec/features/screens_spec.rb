# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Screens", :db do
  let(:model) { Factory[:model] }
  let(:screen) { Factory[:screen, model_id: model.id] }
  let(:path) { SPEC_ROOT.join "support/fixtures/test.png" }

  it "creates", :aggregate_failures, :js do
    model
    visit routes.path(:screens)
    click_link "New"
    click_button "Save"

    expect(page).to have_text("must be filled")

    select model.label, from: "screen[model_id]"
    fill_in "screen[label]", with: "Test"
    fill_in "screen[name]", with: "test"
    attach_file "Image", path
    click_button "Save"

    expect(page).to have_text("Test")
  end

  it "edits", :aggregate_failures, :js do
    screen
    visit routes.path(:screens)

    click_link "Edit"
    click_button "Save"

    expect(page).to have_text(model.label)

    click_link "Edit"
    fill_in "screen[label]", with: nil
    click_button "Save"

    expect(page).to have_text("must be filled")

    fill_in "screen[label]", with: "Edit Test"
    attach_file "Image", path
    click_button "Save"

    expect(page).to have_text("Edit Test")
  end

  it "deletes", :js do
    screen
    visit routes.path(:screens)

    within ".bit-card", text: screen.label do
      accept_prompt { click_button "Delete" }
    end

    expect(page).to have_no_text(screen.label)
  end
end
