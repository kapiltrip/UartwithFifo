`timescale 1ns/1ps

module uart_top #(
    parameter integer TX_DIV = 5208,
    parameter integer RX_DIV = 325
) (
    input clk,
    input reset,
    input [7:0] data_in,
    input wr_en,
    input rdy_clr,
    output rdy,
    output busy,
    output [7:0] data_out
);
    wire tx_en;
    wire rx_en;
    wire tx_line;

    // TX FIFO (buffers user writes so they can be faster than UART line rate)
    wire tx_fifo_empty;
    wire [7:0] tx_fifo_dout;

    // Transmitter busy (state != IDLE)
    wire tx_busy;

    // When transmitter is idle and FIFO has data, pop 1 byte and start TX.
    wire tx_start = (!tx_fifo_empty) && (tx_busy == 1'b0);

    baud_rate_generator #(
        .TX_DIV(TX_DIV),
        .RX_DIV(RX_DIV)
    ) brg (
        .clk(clk),
        .reset(reset),
        .tx_en(tx_en),
        .rx_en(rx_en)
    );

    uart_fifo tx_fifo (
        .clk(clk),
        .reset(reset),
        .wr_en(wr_en),
        .wr_data(data_in),
        .full(),
        .rd_en(tx_start),
        .rd_data(tx_fifo_dout),
        .empty(tx_fifo_empty)
    );

    uart_sender tx_inst (
        .clk(clk),
        .rst(reset),
        .wr_en(tx_start),
        .tx_en(tx_en),
        .data_in(tx_fifo_dout),
        .tx(tx_line),
        .busy(tx_busy)
    );

    // Keep original meaning: `busy` = transmitter busy.
    assign busy = tx_busy;

    // RX FIFO (stores complete received bytes until the user reads them).
    wire rx_byte_ready;
    wire [7:0] rx_byte;
    wire rx_fifo_full;
    wire rx_fifo_empty;
    wire [7:0] rx_fifo_dout;

    // Capture each receiver result once. If the FIFO is full, the receiver
    // keeps rx_byte_ready asserted until a FIFO location becomes available.
    wire rx_fifo_write = rx_byte_ready && !rx_fifo_full;
    wire rx_fifo_read = rdy_clr && !rx_fifo_empty;

    uart_receiver rx_inst (
        .clk(clk),
        .rst(reset),
        .rx(tx_line),
        .rdy_clr(rx_fifo_write),
        .rx_en(rx_en),
        .rdy(rx_byte_ready),
        .data_out(rx_byte)
    );

    uart_fifo rx_fifo (
        .clk(clk),
        .reset(reset),
        .wr_en(rx_fifo_write),
        .wr_data(rx_byte),
        .full(rx_fifo_full),
        .rd_en(rx_fifo_read),
        .rd_data(rx_fifo_dout),
        .empty(rx_fifo_empty)
    );

    // Preserve the original user interface: rdy means at least one byte is
    // buffered, data_out shows the oldest byte, and rdy_clr consumes it.
    assign rdy = !rx_fifo_empty;  //? use of this rdy ?
    assign data_out = rx_fifo_dout;
endmodule
