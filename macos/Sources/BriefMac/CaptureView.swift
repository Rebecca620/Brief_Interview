import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct CaptureView: View {
  @ObservedObject var model: CaptureModel
  @State private var targeted = false
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorSchemeContrast) private var contrast
  var body: some View {
    VStack(spacing: 0) {
      header.padding(.horizontal, 24).padding(.vertical, 18)
        .fixedSize(horizontal: false, vertical: true)
        .background(chrome)
      Divider()
      ScrollView(.vertical) {
        inputs.padding(.horizontal, 24).padding(.vertical, 20)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Divider()
      footer.padding(.horizontal, 24).padding(.vertical, 16)
        .fixedSize(horizontal: false, vertical: true)
        .background(chrome)
    }
    .frame(width: 420, height: model.panelHeight)
    .background(Color(nsColor: .windowBackgroundColor))
  }
  private var chrome: some ShapeStyle {
    if reduceTransparency || contrast == .increased {
      return AnyShapeStyle(Color(nsColor: .windowBackgroundColor))
    }
    return AnyShapeStyle(.regularMaterial)
  }
  private var header: some View {
    HStack {
      Image(systemName: "doc.text")
        .font(.system(size: 21, weight: .medium))
        .foregroundStyle(Color.accentColor)
        .frame(width: 34, height: 34)
      VStack(alignment: .leading, spacing: 3) {
        Text("Brief").font(.title2.weight(.semibold))
        Text("A clear report starts here.").font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      Button {
        model.openAction?(model.destination)
      } label: {
        Image(systemName: "arrow.up.right.square").frame(width: 28, height: 28)
      }.buttonStyle(.borderless).help("Open report window").accessibilityLabel("Open report window")
      Button {
        model.closeAction?()
      } label: {
        Image(systemName: "xmark").frame(width: 28, height: 28)
      }.buttonStyle(.borderless).help("Close capture panel").accessibilityLabel(
        "Close capture panel")
    }
  }
  private var inputs: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 12) {
        Text("DESTINATION").font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(
          .secondary)
        Picker("Add to", selection: $model.destination) {
          Text("New report").tag("")
          ForEach(model.reports) { report in
            Text(report.title.isEmpty ? "Untitled report" : report.title).tag(report.id)
          }
        }.disabled(model.processing || model.collecting)

      }
      .padding(14)
      .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
      VStack(spacing: 8) {
        Image(systemName: "tray.and.arrow.down").font(.system(size: 26, weight: .light))
          .foregroundStyle(Color.accentColor)
        Text(targeted ? "Release to collect" : "Drop files here").font(.headline)
        Text("PDF, Word, JSON, CSV, notes & images").font(.caption).foregroundStyle(.secondary)
        Button("Choose files…") { model.chooseFiles() }.buttonStyle(.link).disabled(
          model.processing)
        Text("Stays open while you use Finder.").font(.caption2).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity).padding(18)
      .background(
        targeted ? Color.accentColor.opacity(0.12) : Color.accentColor.opacity(0.035),
        in: RoundedRectangle(cornerRadius: 12)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 12).strokeBorder(
          targeted
            ? Color.accentColor : Color.secondary.opacity(contrast == .increased ? 0.8 : 0.35),
          style: StrokeStyle(lineWidth: 1, dash: [5]))
      )
      .onDrop(
        of: [UTType.fileURL.identifier, UTType.plainText.identifier], isTargeted: $targeted,
        perform: drop)
      if !model.files.isEmpty {
        VStack(spacing: 7) {
          ForEach(model.files) { file in
            HStack {
              Image(systemName: "doc").foregroundStyle(.secondary)
              Text(file.name).lineLimit(1).truncationMode(.middle)
              Spacer()
              Text(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))
                .font(.caption).foregroundStyle(.secondary)
              Button {
                model.files.removeAll { $0.id == file.id }
              } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
              }.buttonStyle(.plain).accessibilityLabel("Remove \(file.name)").disabled(
                model.processing)
            }
          }
        }
      }
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Text("Notes").font(.subheadline.weight(.medium))
          Spacer()
          Button("Paste") { model.paste() }.buttonStyle(.link).disabled(
            model.processing || model.collecting)
        }
        ZStack(alignment: .topLeading) {
          TextEditor(text: $model.notes).font(.system(size: 13)).scrollContentBackground(.hidden)
            .frame(height: 84).padding(8)
            .accessibilityLabel("Capture notes").disabled(model.processing || model.collecting)
          if model.notes.isEmpty {
            Text("What changed? What needs a decision?\nAdd a few notes to get started.")
              .font(.system(size: 13)).foregroundStyle(.secondary)
              .padding(.horizontal, 13).padding(.vertical, 16)
              .allowsHitTesting(false).accessibilityHidden(true)
          }
        }
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.2)))
      }
      if model.destination.isEmpty {
        DisclosureGroup("Title & layout") {
          VStack(alignment: .leading, spacing: 12) {
            TextField("Report title (optional)", text: $model.title)
              .textFieldStyle(.roundedBorder)
              .accessibilityLabel("Report title")
            Picker("Layout", selection: $model.template) {
              Text("Weekly update").tag("standard")
              Text("Project retrospective").tag("retrospective")
            }
          }.padding(.top, 10)
        }
        .font(.subheadline)
        .disabled(model.processing || model.collecting)
      }
      if !model.error.isEmpty {
        Text(model.error).font(.caption).foregroundStyle(.red).textSelection(.enabled).fixedSize(
          horizontal: false, vertical: true)
      }
      HStack(alignment: .top, spacing: 8) {
        if model.processing || model.collecting || !model.ready {
          ProgressView().controlSize(.small)
        }
        Text(model.ready ? model.status : "Preparing the local report engine…").font(.caption)
          .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }
  }
  private var footer: some View {
    VStack(alignment: .leading, spacing: 12) {
      Button {
        if model.processing {
          model.openAction?(model.destination)
        } else {
          model.generateAction?()
        }
      } label: {
        HStack {
          Spacer()
          Text(
            model.processing
              ? "Review in report window…"
              : (model.destination.isEmpty ? "Build report draft" : "Add to report")
          )
          .fontWeight(.semibold)
          Image(systemName: "arrow.right")
          Spacer()
        }.padding(.vertical, 5)
      }
      .buttonStyle(.borderedProminent).controlSize(.large).disabled(
        !model.processing && !model.canGenerate)
      HStack {
        Button("Try an example") { model.example() }.buttonStyle(.link).disabled(
          model.processing || model.collecting)
        Spacer()
        Text("On this Mac · 2 MB per file").font(.caption2).foregroundStyle(.secondary)
        Button("Quit") { NSApp.terminate(nil) }
          .buttonStyle(.borderless).help("Quit Brief (⌘Q)").accessibilityLabel("Quit Brief")
      }
    }
  }
  private func drop(_ providers: [NSItemProvider]) -> Bool {
    guard !model.processing else { return false }
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
          let url =
            (item as? URL)
            ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
          if let url { Task { @MainActor in model.add(urls: [url]) } }
        }
      } else {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
          let text =
            (item as? String) ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
          if let text {
            Task { @MainActor in
              guard !model.processing else { return }
              if model.notes.utf8.count + text.utf8.count <= 2 * 1024 * 1024 {
                model.notes += (model.notes.isEmpty ? "" : "\n\n") + text
              } else {
                model.error = "Notes exceed 2 MB."
              }
            }
          }
        }
      }
    }
    return true
  }
}
