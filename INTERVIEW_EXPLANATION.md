# How to Explain the UART with TX and RX FIFOs in an Interview

## 30-second version

I designed and verified an 8-N-1 UART transceiver in Verilog. The design has a baud-rate generator, a transmitter FSM, a 16x-oversampling receiver FSM, and separate 16-byte FIFOs on both the transmit and receive sides. The TX FIFO lets a processor write a burst without waiting for each serial frame. The RX FIFO prevents unread bytes from being overwritten when software reads more slowly than the serial link. I verified the complete loopback design in AMD Vivado XSim with 12 self-checking test cases covering data patterns, burst ordering, delayed RX reads, reset recovery, FIFO full protection, simultaneous FIFO read/write, and pointer wrap-around. All 12 cases passed.

## 2-minute interview answer

The project is a modular UART transceiver written in pure Verilog. It uses the common 8-N-1 frame format: one low start bit, eight data bits transmitted least-significant-bit first, no parity bit, and one high stop bit.

I split the design into five responsibilities:

1. `baud_rate_generator` creates a transmit bit tick and a receiver oversampling tick.
2. `uart_sender` is a four-state FSM: IDLE, START, DATA, and STOP.
3. `uart_receiver` is another four-state FSM. It detects the falling start edge, validates the start bit near its center, then samples each data bit once every 16 receiver ticks.
4. A 16x8 TX FIFO decouples fast parallel writes from the slow serial transmitter.
5. A second 16x8 RX FIFO stores completed bytes until the user acknowledges them.

The top-level design uses internal loopback for verification, so the transmitter serial output directly drives the receiver serial input. When the receiver finishes a frame, its byte-ready signal automatically writes the byte into the RX FIFO. At the external interface, `rdy` means that the RX FIFO is not empty, `data_out` shows its oldest byte, and a pulse on `rdy_clr` removes that byte.

For verification, I used an accelerated divider in simulation so complete UART frames appear quickly without changing the state-machine behavior. The testbench is self-checking: it compares actual bytes and FIFO states with expected values, counts errors, prints a clear PASS banner only when every check succeeds, and calls `$fatal` on failure. Vivado XSim completed all 12 tests with zero errors at 4098 ns.

## Architecture you can draw on a whiteboard

```text
Parallel producer                                  Parallel consumer
data_in + wr_en                                    data_out + rdy/rdy_clr
       |                                                     ^
       v                                                     |
 [16x8 TX FIFO] -> [UART TX FSM] -> serial line -> [UART RX FSM] -> [16x8 RX FIFO]
                         ^                           ^
                         |                           |
                     tx_enable                  rx_enable (16x)
                         \___________________________/
                                  |
                         [baud_rate_generator]
```

The most important system idea is rate decoupling. A CPU can enqueue bytes in a few clock cycles, but UART sends roughly one byte every ten bit periods. The TX FIFO absorbs producer bursts. On the other side, the UART receiver may complete a byte before software is ready to read it, so the RX FIFO absorbs consumer delay.

## Module-by-module explanation

### `baud_rate_generator.v`

- Counts the fast system clock.
- Produces `tx_enable` once per UART bit time.
- Produces `rx_en` 16 times per UART bit time.
- Keeps baud timing separate from protocol state, so the TX and RX FSMs only move on enable pulses.

At a 50 MHz clock and 9600 baud, the transmit divider is approximately `50,000,000 / 9,600 = 5208`. The receive divider is approximately `5208 / 16 = 325`.

### `uart_sender.v`

- `IDLE`: holds `tx = 1` and waits for a byte.
- `START`: drives the start bit low on the next transmit tick.
- `DATA`: sends `data[0]` through `data[7]`, one bit per transmit tick.
- `STOP`: drives the line high for the stop bit, then returns to IDLE.

The input byte is copied into an internal register before transmission so later changes on `data_in` cannot corrupt the active frame.

### `uart_receiver.v`

- `IDLE`: waits for the line to go low.
- `START`: waits to the center of the suspected start bit and rejects a false start if the line has already returned high.
- `DATA`: samples one data bit after each group of 16 oversampling ticks.
- `STOP`: checks that the stop bit is high before presenting the completed byte.

Oversampling is useful because the UART endpoints do not share a clock. Sampling near the middle of the bit provides margin from the transitions at the bit boundaries.

### `uart_fifo.v`

- Stores 16 entries of 8 bits each.
- Uses a write pointer, read pointer, and a five-bit count.
- `empty` is true when count is zero.
- `full` is true when count is 16.
- Ignores writes while full and reads while empty.
- Supports a read and write in the same clock; the count remains unchanged in that case.
- Uses show-ahead output, so `rd_data` always displays the current front entry.

### `uart_top.v`

The TX path is:

```text
wr_en/data_in -> TX FIFO -> tx_start when sender is idle -> sender -> tx_line
```

The RX path is:

```text
tx_line -> receiver -> rx_byte_ready/rx_byte -> RX FIFO -> rdy/data_out
```

`rdy_clr` no longer clears a single receiver register directly. It pops one entry from the RX FIFO. This keeps the original simple interface while adding multi-byte buffering.

## Why two FIFOs are useful

### TX FIFO

Without the TX FIFO, the producer must check `busy` and wait for every frame. With the FIFO, it can enqueue several bytes quickly and continue doing other work while the transmitter drains the queue at the baud rate.

### RX FIFO

Without the RX FIFO, a newly received byte can overwrite the previous byte if the consumer has not acknowledged it. With the FIFO, multiple completed bytes wait in order. `data_out` remains the oldest unread byte until `rdy_clr` pops it.

### What the FIFOs do not solve

A finite FIFO can still overflow if the average producer rate remains greater than the average consumer rate for long enough. A hardware-ready interface should expose a full/available indication, an interrupt, or a flow-control mechanism so software can react before data is lost.

## Verification story

The 12 simple test cases are deliberately easy to explain:

| ID | What it proves |
|---|---|
| TC01 | Reset produces the correct idle state. |
| TC02 | A normal byte (`A5`) survives the complete TX-to-RX path. |
| TC03 | An all-zero payload is framed and received correctly. |
| TC04 | An all-one payload and high stop/idle behavior are correct. |
| TC05 | Alternating patterns (`55`, `AA`) exercise frequent serial transitions. |
| TC06 | Back-to-back user writes are buffered by the TX FIFO and transmitted in order. |
| TC07 | Six received bytes can wait in the RX FIFO and are popped in the original order. |
| TC08 | Reset during an active transfer flushes both FIFOs and returns the line to idle. |
| TC09 | Communication works again immediately after reset. |
| TC10 | A FIFO becomes full at 16 entries and ignores an overflow write. |
| TC11 | Simultaneous FIFO read/write keeps the occupancy constant. |
| TC12 | Pointer wrap-around does not prevent later FIFO reuse. |

The testbench uses case-inequality checks where unknown values matter, an `error_count`, explicit PASS messages, a final `UART_FIFO_VERIFICATION_PASS` banner, and `$fatal` on failure or timeout. This is stronger than looking at a waveform manually because the checks are repeatable and automatically fail when behavior changes.

## How to explain the waveform

Start with `test_phase`, because it tells the interviewer which test is active.

- In phases 2-5, each `wr_en` pulse enqueues one pattern. `busy` goes high for the frame, `tx_line` shows the start/data/stop sequence, `rx_byte_ready` pulses after the receiver finishes, and `rdy_clr` removes the byte from the RX FIFO.
- In phase 6, six `wr_en` pulses arrive close together. The TX FIFO count rises, then falls as the transmitter completes frames. The receiver creates one `rx_byte_ready` pulse per byte.
- While reads are withheld, the RX FIFO count climbs from 0 to 6 and `rdy` stays high. `data_out` remains `11`, proving show-ahead behavior and FIFO ordering.
- In phase 7, six `rdy_clr` pulses rapidly pop the stored bytes. The RX FIFO count reaches zero and `rdy` falls.
- Near 3590 ns, reset is asserted during activity. `busy`, the FIFO counts, and `rdy` clear, while `tx_line` returns high.
- In phases 10-12, the standalone FIFO count reaches 16, `fifo_full` asserts, the count returns to zero during reads, simultaneous read/write keeps the count at one, and the FIFO works after wrap-around.

## Common interviewer questions and strong answers

### Why is UART called asynchronous?

The sender does not transmit a clock signal with the data. Both endpoints independently generate approximately the same baud rate. The receiver uses the start bit to align its sampling and then samples near the center of each data bit.

### Why is the data LSB-first?

That is the conventional UART ordering. The sender indexes from bit 0 to bit 7, and the receiver stores the first sampled data bit into bit 0.

### Why oversample at 16x?

It gives multiple timing positions inside each bit. The receiver can detect the start transition and then sample near the center, where it has the most margin from bit-edge uncertainty. A more robust design can also majority-vote several center samples.

### Why use a count in the FIFO instead of only comparing pointers?

A count makes `full` and `empty` unambiguous even when the pointers are equal. Equal pointers can mean either empty or full in a circular buffer unless an additional wrap bit or count is used.

### What happens during simultaneous FIFO read and write?

Both pointers advance, but occupancy does not change. The FIFO code handles this with a case statement on `{do_write, do_read}` and leaves the count unchanged for `2'b11`.

### Is this design ready for an external asynchronous RX pin?

The loopback simulation proves protocol and buffering logic, but a hardware version should add a synchronizer on the external RX input to reduce metastability risk. I would also add framing-error reporting, optional parity, majority voting, and visible FIFO status/overflow flags.

### Why does the simulation use small divider values?

It is an acceleration technique. The relationship remains the same: one TX tick per bit and 16 RX ticks per bit. Smaller dividers reduce simulation runtime without changing the protocol state transitions being tested.

## Honest limitations and next improvements

- The top-level currently uses internal loopback rather than external TX/RX pins.
- The external interface does not expose TX-full or RX-full backpressure.
- The receiver validates the stop bit but does not output a framing-error flag.
- There is no parity generation/checking.
- A real external RX input needs a two-flop synchronizer.
- Majority voting around the bit center would improve noise tolerance.
- Configurable data bits, parity, stop bits, and baud rate would make the design more reusable.

Mentioning these limitations is a strength. It shows that the implemented scope is intentional and that you understand the difference between a correct simulation project and a production-ready UART peripheral.

## Recommended live demo sequence

1. Open `rtlCode/uart_top.v` and show the two FIFO instances.
2. Open `rtlCode/uart_top_tb.v` and point out the numbered test phases and final PASS/FAIL logic.
3. Open `vivado/uart_fifo_verification/uart_fifo_verification.xpr`.
4. Load `uart_fifo_waveform.wcfg` if it is not already loaded.
5. Show the six-byte burst in TC06 and explain the TX FIFO count falling while RX FIFO count rises.
6. Show the rapid `rdy_clr` pulses in TC07 and explain ordered dequeue.
7. Show the final XSim banner: `UART_FIFO_VERIFICATION_PASS: all 12 test cases passed at 4098 ns`.

That sequence demonstrates architecture, code quality, waveform understanding, and verification evidence in a few minutes.
