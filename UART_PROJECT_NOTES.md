# UART Project Notes (Pure Verilog)

This file explains what **each module and variable/signal** in this project is doing, and **where each signal comes from**, so you can relate the code to the UART block diagrams/FSM from your reference video.

## Big Picture (Data Flow)

**Who talks to who**

- `uart_top_tb` (testbench) drives **parallel** data into `uart_top`.
- `uart_top` connects the sub-modules:
  - `baud_rate_generator` creates timing pulses:
    - `tx_enable` for the transmitter (1 pulse per UART bit time)
    - `rx_enable` for the receiver (oversampling pulses, 16x faster)
  - `uart_sender` converts **parallel byte ? serial TX line**
  - `uart_receiver` converts **serial RX line ? parallel byte**
- In this project, `uart_sender.tx` is directly wired to `uart_receiver.rx` (loopback inside `uart_top`).

**Signals at a glance**

```
uart_top_tb
  data_in, write_enable  ---> uart_top ---> uart_sender ---> tx_line ---> uart_receiver ---> data_out, ready
  ready_clear            ---> uart_top -------------------------------> uart_receiver

baud_rate_generator
  tx_enable -------------> uart_sender
  rx_enable -------------> uart_receiver
```

## 1) `baud_rate_generator` (Timing Pulse Generator)

**File:** `baud_rate_generator.v`

### What this module does

It converts the fast reference clock (`clk`, e.g. 50 MHz) into:

- `tx_enable`: a **1-clock-cycle pulse** that occurs once per UART bit time (baud tick).
- `rx_enable`: a **1-clock-cycle pulse** that occurs 16x faster (oversampling tick).

The UART TX/RX logic only ?moves forward? when these enable pulses happen.

### Ports (signals that connect to other modules)

- `clk` (input): your fast reference clock.
- `reset` (input): resets counters and outputs.
- `tx_enable` (output reg): goes to `uart_sender.tx_enable`.
- `rx_enable` (output reg): goes to `uart_receiver.rx_enable`.

### Parameters (tuning numbers)

- `TX_DIV` (parameter integer): how many `clk` cycles make **one TX bit time**.
  - For 50 MHz and 9600 baud: `50e6/9600 ? 5208`.
- `RX_DIV` (parameter integer): how many `clk` cycles between **receiver oversampling ticks**.
  - With 16x oversampling: `RX_DIV ? TX_DIV/16 ? 325`.

### Internal variables (what each one does)

- `tx_counter` (reg [12:0]): counts `clk` cycles from `0` up to `TX_DIV-1`.
  - When it hits `TX_DIV-1`, it resets back to 0 and makes `tx_enable = 1` for one clock.
- `rx_counter` (reg [9:0]): counts `clk` cycles from `0` up to `RX_DIV-1`.
  - When it hits `RX_DIV-1`, it resets back to 0 and makes `rx_enable = 1` for one clock.

## 2) `uart_sender` (UART Transmitter)

**File:** `uart_sender.v`

### What this module does

It sends a standard UART frame:

- Start bit: `0`
- 8 data bits: LSB first (`data[0]` then `data[1]` ... `data[7]`)
- Stop bit: `1`

It only changes the output `tx` when `tx_enable` is pulsed by `baud_rate_generator`.

### Ports (signals that connect to other modules)

- `clk` (input): reference clock.
- `reset` (input): puts transmitter into idle (line high).
- `write_enable` (input): **from testbench/top**; tells transmitter ?load this byte and start?.
- `tx_enable` (input): **from `baud_rate_generator`**; 1-cycle pulse at baud rate.
- `data_in` (input [7:0]): **from testbench/top**; the byte you want to send.
- `tx` (output reg): the serial UART TX line.
- `busy` (output): high when the transmitter is not idle.

### State machine (FSM) parameters

These are constants used to label the FSM states:

- `IDLE`: waiting for `write_enable`.
- `START`: waiting for a `tx_enable` tick to output the start bit.
- `DATA`: outputs 8 data bits (LSB first), one bit per `tx_enable`.
- `STOP`: outputs stop bit, then returns to `IDLE`.

### Internal variables (what each one does)

- `state` (reg [1:0]):
  - Stores the current FSM state (`IDLE/START/DATA/STOP`).
- `data` (reg [7:0]):
  - A ?latched copy? of `data_in`.
  - Captured in `IDLE` when `write_enable` goes high.
  - This prevents the byte from changing mid-transmission if `data_in` changes later.
- `index` (reg [2:0]):
  - Which data bit is being sent right now.
  - In `DATA` state, `tx <= data[index]`.
  - Counts 0 ? 7 (8 total bits).
- `busy` (wire, via `assign busy = (state != IDLE);`):
  - A simple ?not idle? indicator for the testbench/user.

## 3) `uart_receiver` (UART Receiver)

**File:** `uart_receiver.v`

### What this module does

It receives the UART serial stream and rebuilds the 8-bit data.

Key idea: **oversampling**.

- `rx_enable` pulses 16x per UART bit.
- The receiver uses a `sample` counter (0..15).
- It samples the data around the **middle of each bit** (in this code: when `sample == 7`).

### Ports (signals that connect to other modules)

- `clk` (input): reference clock.
- `reset` (input): clears state, ready, output data.
- `rx` (input): the serial UART RX line.
  - In this project, it is connected to the transmitter?s `tx` (`tx_line` inside `uart_top`).
- `ready_clear` (input): **from testbench/top**; clears `ready` back to 0 after a byte is read.
- `rx_enable` (input): **from `baud_rate_generator`**; oversampling tick (16x).
- `ready` (output reg): becomes 1 when a full byte has been received and `data_out` is valid.
- `data_out` (output reg [7:0]): the received byte.

### State machine (FSM) parameters

- `START`: wait for start bit (`rx == 0`) and ?walk through? one full bit time.
- `DATA`: oversample each data bit, store 8 bits into `temp`.
- `STOP`: wait through the stop-bit time, then assert `ready`.

### Internal variables (what each one does)

- `state` (reg [1:0]):
  - Current receiver FSM state (`START/DATA/STOP`).
- `sample` (reg [3:0]):
  - Counts oversampling ticks from 0 ? 15 for each bit time.
  - In `DATA`, when `sample == 7`, we sample `rx` (middle of the bit).
  - In several transitions we reset it back to 0.
- `index` (reg [3:0]):
  - Counts how many data bits have been collected.
  - Goes 0 ? 8 (8 bits total).
  - We store bits into `temp[index[2:0]]`.
- `temp` (reg [7:0]):
  - Temporary storage while receiving the byte.
  - After stop state completes, `data_out <= temp`.

### How `ready` works here

- `ready` is set to `1` at the end of a successful stop-bit period.
- `ready` stays `1` until the testbench/user asserts `ready_clear = 1` for a clock.

## 4) `uart_top` (Wiring / Integration)

**File:** `uart_top.v`

### What this module does

It instantiates and connects:

- `baud_rate_generator`
- `uart_sender`
- `uart_receiver`

It also creates the internal wires that connect them together.

### Ports

- Inputs from ?outside world/testbench?:
  - `clk`, `reset`
  - `data_in`, `write_enable` (for TX)
  - `ready_clear` (for RX)
- Outputs to ?outside world/testbench?:
  - `ready`, `data_out` (from RX)
  - `busy` (from TX)

### Internal wires (what each one does)

- `tx_clock_enable` (wire):
  - From `baud_rate_generator.tx_enable` to `uart_sender.tx_enable`.
- `rx_clock_enable` (wire):
  - From `baud_rate_generator.rx_enable` to `uart_receiver.rx_enable`.
- `tx_line` (wire):
  - The serial wire between TX and RX inside this project.
  - `uart_sender.tx -> tx_line -> uart_receiver.rx`

## 5) `uart_top_tb` (Testbench)

**File:** `uart_top_tb.v`

### What this module does

It simulates a user:

- Applies reset
- Sends one byte (`8'h41`)
- Waits until transmitter finishes (`busy == 0`)
- Waits for receiver to complete (`ready == 1`)
- Prints received byte (`data_out`)
- Clears `ready` using `ready_clear`
- Repeats for `8'h55`

### Testbench variables (what each one does)

- `clk` (reg):
  - Generated with `always #10 clk = ~clk;` (20 ns period).
- `reset` (reg):
  - Pulsed at the beginning to reset the full design.
- `data_in` (reg [7:0]):
  - Drives `uart_top.data_in` (what byte to send).
- `write_enable` (reg):
  - Drives `uart_top.write_enable` (start sending the byte).
  - Asserted for one clock in `send_byte`.
- `ready_clear` (reg):
  - Drives `uart_top.ready_clear` to clear the receiver?s `ready` flag.
  - Asserted for one clock in `clear_ready`.
- `ready` (wire):
  - From `uart_receiver.ready` (byte received and stable).
- `busy` (wire):
  - From `uart_sender.busy` (transmitter active).
- `data_out` (wire [7:0]):
  - From `uart_receiver.data_out` (received byte).

### Tasks (small helpers)

- `send_byte(input [7:0] d)`:
  - Puts `d` on `data_in` and pulses `write_enable` for 1 cycle.
- `clear_ready()`:
  - Pulses `ready_clear` for 1 cycle to clear the receiver?s `ready` flag.


## 6) FIFO Buffering (TX FIFO)

This project now includes a **minimal TX FIFO** so the "user side" (testbench / CPU) can write bytes faster than the UART line can transmit.

- **New module:** `uart_fifo.v`
  - `mem[0:15]`: stores up to 16 bytes
  - `wr_ptr`: points to where the next written byte goes
  - `rd_ptr`: points to the next byte to transmit
  - `count`: how many bytes are stored (0 = empty, 16 = full)

- **How it is wired in `uart_top.v`:**
  - `write_enable` + `data_in` (from testbench/user) -> FIFO write port
  - When the transmitter is idle and FIFO is not empty, `uart_top` asserts `tx_start`:
    - FIFO pops 1 byte (`rd_en = tx_start`)
    - that byte becomes the transmitter's `data_in`
    - transmitter `write_enable = tx_start` starts the UART frame

This is the "FIFO buffering to handle rate mismatch" part: **the testbench can push bytes back-to-back even while the transmitter is busy.**

