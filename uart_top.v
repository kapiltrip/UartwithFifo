`timescale 1ns/1ps

module uart_top (
    input clk,
    input reset,
    input [7:0] data_in,
    input write_enable,
    input rdy_clr,
    output rdy,
    output busy,
    output [7:0] data_out
);
    wire tx_clock_enable;
    wire rx_en;
    wire tx_line;

    // TX FIFO (buffers user writes so they can be faster than UART line rate)
    wire tx_fifo_full;
    wire tx_fifo_empty;
    wire [7:0] tx_fifo_dout;

    // Transmitter busy (state != IDLE)
    wire tx_busy;

    // When transmitter is idle and FIFO has data, pop 1 byte and start TX.
    wire tx_start = (!tx_fifo_empty) && (tx_busy == 1'b0);

    baud_rate_generator brg (
        .clk(clk),
        .reset(reset),
        .tx_enable(tx_clock_enable),
        .rx_en(rx_en)
    );

    uart_fifo tx_fifo (
        .clk(clk),
        .reset(reset),
        .wr_en(write_enable),
        .wr_data(data_in),
        .full(tx_fifo_full),
        .rd_en(tx_start),
        .rd_data(tx_fifo_dout),
        .empty(tx_fifo_empty)
    );

    uart_sender tx_inst (
        .clk(clk),
        .rst(reset),
        .wr_en(tx_start),
        .tx_en(tx_clock_enable),
        .data_in(tx_fifo_dout),
        .tx(tx_line),
        .busy(tx_busy)
    );

    // Keep original meaning: `busy` = transmitter busy.
    assign busy = tx_busy;

    uart_receiver rx_inst (
        .clk(clk),
        .rst(reset),
        .rx(tx_line),
        .rdy_clr(rdy_clr),
        .rx_en(rx_en),
        .rdy(rdy),
        .data_out(data_out)
    );
endmodule
