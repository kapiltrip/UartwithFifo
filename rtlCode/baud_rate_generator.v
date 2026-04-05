`timescale 1ns/1ps

module baud_rate_generator (
    input clk,
    input reset,
    output reg tx_enable,
    output reg rx_en
);
    parameter integer TX_DIV = 5208;
    parameter integer RX_DIV = 325;

    reg [12:0] tx_counter;
    reg [9:0] rx_counter;

    always @(posedge clk) begin
        if (reset) begin
            tx_counter <= 13'd0;
            tx_enable <= 1'b0;
        end else if (tx_counter == (TX_DIV - 1)) begin
            tx_counter <= 13'd0;
            tx_enable <= 1'b1;
        end else begin
            tx_counter <= tx_counter + 13'd1;
            tx_enable <= 1'b0;
        end
    end

    always @(posedge clk) begin
        if (reset) begin
            rx_counter <= 10'd0;
            rx_en <= 1'b0;
        end else if (rx_counter == (RX_DIV - 1)) begin
            rx_counter <= 10'd0;
            rx_en <= 1'b1;
        end else begin
            rx_counter <= rx_counter + 10'd1;
            rx_en <= 1'b0;
        end
    end
endmodule
