# TODO

## FIFO Verification — 24 July 2026

- [ ] Verify the FIFO-related functionality tomorrow, 24 July 2026.
- [ ] Further plan: verify the FIFO behavior using Verilog simulation and a self-checking testbench.

### Verification focus

- [ ] Confirm FIFO write and read ordering.
- [ ] Check the `full` and `empty` flags.
- [ ] Test overflow and underflow protection.
- [ ] Test simultaneous read and write operations.
- [ ] Confirm that UART transmit and receive data pass correctly through their FIFOs.

## Review Notes

- Review this statement: The source feeding the UART transmitter is usually the CPU, firmware, or DMA writing a transmit register/buffer. Microchip documents describe it this way: software writes a byte into the transmit buffer, then the UART transmit shift register takes that byte and sends one full frame at the configured baud rate, adding the framing bits.
- Review this statement: RX can observe the line up to 16 times during one transmitted bit period before TX moves to the next bit, but those 16 observations are mainly used for timing recovery and reliable center sampling. UART receivers usually decide the bit from one middle sample or a small majority vote around the center, rather than treating all 16 samples as equally valid data samples.
- Review this statement: `rdy_clr` is an external input used to clear the receiver `rdy` flag after a valid byte has already been received, placed on `data_out`, and acknowledged by outside logic. The receiver raises `rdy` at the end of a valid frame; external logic later pulses `rdy_clr` to return `rdy` from `1` to `0` so the next received byte can be flagged cleanly.
