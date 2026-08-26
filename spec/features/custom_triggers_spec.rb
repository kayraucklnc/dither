# frozen_string_literal: true

require "hanami_helper"

# The trigger the whole facts system exists for: a calendar connector nobody
# has written yet gives you commute rules, and the rule engine never learns
# what a meeting is.
RSpec.describe "Extension facts as triggers", :db do
  subject(:resolver) { Dither::Aspects::Scenes::Resolver.new }

  let(:model) { Factory[:model, width: 800, height: 480] }
  let(:device) { Factory[:device, model_id: model.id, label: "Hallway"] }
  let(:commute) { Factory[:scene, label: "Commute", name: "commute"] }
  let(:quiet) { Factory[:scene, label: "Quiet", name: "quiet"] }

  def calendar minutes:, location:
    Factory[
      :extension,
      label: "Calendar",
      facts: [
        {"key" => "next_meeting_in", "label" => "Next meeting starts in",
         "type" => "duration", "path" => "source_1.next.minutes_until"},
        {"key" => "next_meeting_location", "label" => "Next meeting location",
         "type" => "text", "path" => "source_1.next.location"}
      ],
      sample: {"source_1" => {"next" => {"minutes_until" => minutes, "location" => location}}}
    ]
  end

  def rule_for extension, fact:, operator:, value: nil, scene: commute
    Factory[
      :rule,
      device_id: device.id,
      scene_id: scene.id,
      position: 0,
      condition_kind: "extension_fact",
      settings: {
        "extension_id" => extension.id,
        "extension_label" => extension.label,
        "fact" => fact,
        "fact_label" => "Next meeting starts in",
        "operator" => operator,
        "value" => value
      }
    ]
  end

  it "shows the commute scene when a meeting starts within thirty minutes" do
    rule_for calendar(minutes: 20, location: "Milano Centrale"), fact: "next_meeting_in",
             operator: "lt", value: 30
    Factory[:rule, device_id: device.id, scene_id: quiet.id, position: 1]

    expect(resolver.call(device).value!.scene.label).to eq "Commute"
  end

  it "does not when the meeting is further off" do
    rule_for calendar(minutes: 90, location: "Milano Centrale"), fact: "next_meeting_in",
             operator: "lt", value: 30
    Factory[:rule, device_id: device.id, scene_id: quiet.id, position: 1]

    expect(resolver.call(device).value!.scene.label).to eq "Quiet"
  end

  it "can ask whether the meeting has a location at all" do
    rule_for calendar(minutes: 20, location: ""), fact: "next_meeting_location",
             operator: "present"
    Factory[:rule, device_id: device.id, scene_id: quiet.id, position: 1]

    expect(resolver.call(device).value!.scene.label).to eq "Quiet"
  end

  it "can match on what the location says" do
    rule_for calendar(minutes: 20, location: "Milano Centrale"), fact: "next_meeting_location",
             operator: "contains", value: "milano"
    Factory[:rule, device_id: device.id, scene_id: quiet.id, position: 1]

    expect(resolver.call(device).value!.scene.label).to eq "Commute"
  end

  it "reads back as a sentence" do
    rule = rule_for calendar(minutes: 20, location: "Milano Centrale"),
                    fact: "next_meeting_in", operator: "lt", value: 30

    expect(Dither::Repositories::Rule.new.find(rule.id).condition_label)
      .to eq "Calendar: Next meeting starts in is less than 30"
  end

  it "does not hold when the extension has been deleted" do
    extension = calendar minutes: 20, location: "Home"
    rule_for extension, fact: "next_meeting_in", operator: "lt", value: 30
    Dither::Repositories::Extension.new.delete extension.id
    Factory[:rule, device_id: device.id, scene_id: quiet.id, position: 1]

    expect(resolver.call(device).value!.scene.label).to eq "Quiet"
  end
end
