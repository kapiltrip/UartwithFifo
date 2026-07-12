from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
VCD_PATH = ROOT / "vivado" / "uart_fifo_verification" / "uart_fifo_waveform.vcd"
OUTPUT_DIR = ROOT / "report_assets"


def parse_vcd(path):
    signals = {}
    scopes = []
    changes = {}
    definitions_done = False

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not definitions_done:
                if line.startswith("$scope"):
                    scopes.append(line.split()[2])
                elif line.startswith("$upscope"):
                    scopes.pop()
                elif line.startswith("$var"):
                    parts = line.split()
                    width = int(parts[2])
                    ident = parts[3]
                    name = parts[4]
                    signals["/" + "/".join(scopes + [name])] = (ident, width)
                    changes.setdefault(ident, [])
                elif line.startswith("$enddefinitions"):
                    definitions_done = True
                continue

            if not line:
                continue
            if line.startswith("#"):
                current_time = int(line[1:]) / 1000.0  # VCD is 1 ps; plot in ns.
            elif line[0] in "01xzXZ":
                ident = line[1:]
                if ident in changes:
                    changes[ident].append((current_time, line[0].lower()))
            elif line[0] in "bB":
                value, ident = line[1:].split()
                if ident in changes:
                    changes[ident].append((current_time, value.lower()))

    return signals, changes


def value_text(raw, kind):
    if any(ch in raw for ch in "xz"):
        return raw.upper()
    value = int(raw, 2)
    if kind == "hex":
        return f"{value:02X}"
    return str(value)


def clip_segments(change_list, start_ns, end_ns):
    current = "x"
    for time_ns, raw in change_list:
        if time_ns <= start_ns:
            current = raw
        else:
            break

    points = [(start_ns, current)]
    points.extend((time_ns, raw) for time_ns, raw in change_list if start_ns < time_ns < end_ns)
    points.append((end_ns, points[-1][1]))
    return points


def draw_waveform(filename, title, rows, start_ns, end_ns):
    signals, changes = parse_vcd(VCD_PATH)
    width = 2800
    height = 1600
    left = 360
    right = 70
    top = 155
    bottom = 125
    plot_width = width - left - right
    plot_height = height - top - bottom
    row_height = plot_height / len(rows)
    image = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(image)

    title_font = ImageFont.truetype("C:/Windows/Fonts/seguisb.ttf", 48)
    label_font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 27)
    small_font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    mono_font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 21)
    navy = "#17365D"
    green = "#149447"
    grid = "#CBD5E1"

    draw.text((left, 45), title, font=title_font, fill=navy)

    def x_position(time_ns):
        return left + (time_ns - start_ns) * plot_width / (end_ns - start_ns)

    for row_index, (label, path, kind) in enumerate(rows):
        y_center = top + (row_index + 0.5) * row_height
        if row_index % 2:
            draw.rectangle(
                (left, top + row_index * row_height, width - right, top + (row_index + 1) * row_height),
                fill="#F1F5F9",
            )
        draw.text((22, y_center - 17), label, font=label_font, fill=navy)

        ident, signal_width = signals[path]
        points = clip_segments(changes[ident], start_ns, end_ns)

        if kind == "bit":
            previous_level = None
            for point_index, (time_ns, raw) in enumerate(points):
                level = -0.29 if raw == "1" else 0.29 if raw == "0" else 0.0
                x = x_position(time_ns)
                y = y_center + level * row_height
                if point_index:
                    previous_time, _ = points[point_index - 1]
                    previous_x = x_position(previous_time)
                    previous_y = y_center + previous_level * row_height
                    draw.line((previous_x, previous_y, x, previous_y), fill=green, width=4)
                    draw.line((x, previous_y, x, y), fill=green, width=3)
                previous_level = level
        else:
            for index in range(len(points) - 1):
                segment_left, raw = points[index]
                segment_right = points[index + 1][0]
                left_x = x_position(segment_left)
                right_x = x_position(segment_right)
                draw.line((left_x, y_center, right_x, y_center), fill=green, width=4)
                if segment_right - segment_left > (end_ns - start_ns) * 0.018:
                    text_value = value_text(raw, kind)
                    box = draw.textbbox((0, 0), text_value, font=mono_font)
                    text_width = box[2] - box[0]
                    draw.text(((left_x + right_x - text_width) / 2, y_center - 32), text_value, font=mono_font, fill=navy)
                if index:
                    draw.line((left_x, y_center - 0.23 * row_height, left_x, y_center + 0.23 * row_height), fill=green, width=2)

    tick_count = 8
    for tick in range(tick_count + 1):
        time_ns = start_ns + tick * (end_ns - start_ns) / tick_count
        x = x_position(time_ns)
        draw.line((x, top, x, height - bottom), fill=grid, width=2)
        label = f"{time_ns:,.0f}"
        box = draw.textbbox((0, 0), label, font=small_font)
        draw.text((x - (box[2] - box[0]) / 2, height - bottom + 18), label, font=small_font, fill=navy)

    axis_label = "Simulation time (ns)"
    box = draw.textbbox((0, 0), axis_label, font=label_font)
    draw.text(((left + width - right - (box[2] - box[0])) / 2, height - 72), axis_label, font=label_font, fill=navy)
    draw.text(
        (22, height - 46),
        "Source: AMD Vivado 2024.1 XSim VCD export | resolution: 1 ps | self-checking testbench",
        font=small_font,
        fill="#475569",
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_DIR / filename, optimize=True)


def main():
    overview_rows = [
        ("test_phase", "/uart_top_tb/test_phase", "dec"),
        ("reset", "/uart_top_tb/reset", "bit"),
        ("wr_en", "/uart_top_tb/wr_en", "bit"),
        ("data_in", "/uart_top_tb/data_in", "hex"),
        ("TX FIFO count", "/uart_top_tb/dut/tx_fifo/count", "dec"),
        ("busy", "/uart_top_tb/busy", "bit"),
        ("tx_line", "/uart_top_tb/dut/tx_line", "bit"),
        ("rx_byte_ready", "/uart_top_tb/dut/rx_byte_ready", "bit"),
        ("RX FIFO count", "/uart_top_tb/dut/rx_fifo/count", "dec"),
        ("rdy", "/uart_top_tb/rdy", "bit"),
        ("rdy_clr", "/uart_top_tb/rdy_clr", "bit"),
        ("data_out", "/uart_top_tb/data_out", "hex"),
    ]
    draw_waveform(
        "uart_xsim_waveform_overview.png",
        "UART with TX/RX FIFOs - complete Vivado XSim waveform",
        overview_rows,
        0,
        4100,
    )

    burst_rows = [
        ("test_phase", "/uart_top_tb/test_phase", "dec"),
        ("wr_en", "/uart_top_tb/wr_en", "bit"),
        ("data_in", "/uart_top_tb/data_in", "hex"),
        ("TX FIFO count", "/uart_top_tb/dut/tx_fifo/count", "dec"),
        ("busy", "/uart_top_tb/busy", "bit"),
        ("tx_line", "/uart_top_tb/dut/tx_line", "bit"),
        ("rx_byte_ready", "/uart_top_tb/dut/rx_byte_ready", "bit"),
        ("rx_byte", "/uart_top_tb/dut/rx_byte", "hex"),
        ("RX FIFO count", "/uart_top_tb/dut/rx_fifo/count", "dec"),
        ("rdy", "/uart_top_tb/rdy", "bit"),
        ("rdy_clr", "/uart_top_tb/rdy_clr", "bit"),
        ("data_out", "/uart_top_tb/data_out", "hex"),
    ]
    draw_waveform(
        "uart_xsim_waveform_rx_fifo_detail.png",
        "TX burst and RX FIFO hold/read detail (TC06-TC07)",
        burst_rows,
        1600,
        3610,
    )

    fifo_rows = [
        ("test_phase", "/uart_top_tb/test_phase", "dec"),
        ("fifo_wr_en", "/uart_top_tb/fifo_wr_en", "bit"),
        ("fifo_rd_en", "/uart_top_tb/fifo_rd_en", "bit"),
        ("FIFO count", "/uart_top_tb/fifo_unit/count", "dec"),
        ("fifo_full", "/uart_top_tb/fifo_full", "bit"),
        ("fifo_empty", "/uart_top_tb/fifo_empty", "bit"),
    ]
    draw_waveform(
        "uart_xsim_waveform_fifo_detail.png",
        "Standalone FIFO full, simultaneous access, and wrap-around (TC10-TC12)",
        fifo_rows,
        3940,
        4100,
    )


if __name__ == "__main__":
    main()
