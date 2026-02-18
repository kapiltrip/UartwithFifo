`timescale 1ns/1ps

module uart_top_tb;
    reg clk;
    reg reset;
    reg [7:0] data_in;
    reg write_enable;
    reg rdy_clr;

    wire rdy;
    wire busy;
    wire [7:0] data_out;

    uart_top dut (
        .clk(clk),
        .reset(reset),
        .data_in(data_in),
        .write_enable(write_enable),
        .rdy_clr(rdy_clr),
        .rdy(rdy),
        .busy(busy),
        .data_out(data_out)
    );

    // 50 MHz clock (20 ns period)
    always #10 clk = ~clk;

    task send_byte;
        input [7:0] d;
        begin
            @(negedge clk);
            $display("TB: send %h (tx_busy=%b) at time %0t", d, busy, $time);
            data_in = d;
            write_enable = 1'b1;
            @(negedge clk);
            write_enable = 1'b0;
        end
    endtask

    task clear_ready;
        begin
            @(negedge clk);
            rdy_clr = 1'b1;
            @(negedge clk);
            rdy_clr = 1'b0;
        end
    endtask

    task expect_byte;
        input [7:0] exp;
        begin
            // Ensure we wait for a new ready assertion.
            wait (rdy == 1'b0);
            wait (rdy == 1'b1);

            if (data_out !== exp) begin
                $display("TB ERROR: expected %h, got %h at time %0t", exp, data_out, $time);
                $finish;
            end else begin
                $display("TB: received %h OK at time %0t", data_out, $time);
            end

            clear_ready();
        end
    endtask

    initial begin
        clk = 1'b0;
        reset = 1'b0;
        data_in = 8'd0;
        write_enable = 1'b0;
        rdy_clr = 1'b0;

        // Reset
        @(negedge clk);
        reset = 1'b1;
        @(negedge clk);
        reset = 1'b0;

        // Back-to-back writes (FIFO buffers while TX is busy)
        send_byte(8'h41);
        send_byte(8'h55);
        send_byte(8'hAA);
        send_byte(8'h0F);

        // Receive bytes in order
        expect_byte(8'h41);
        expect_byte(8'h55);
        expect_byte(8'hAA);
        expect_byte(8'h0F);

        // Reset case (after activity) and then send again
        @(negedge clk);
        reset = 1'b1;
        @(negedge clk);
        reset = 1'b0;

        send_byte(8'h12);
        send_byte(8'h34);

        expect_byte(8'h12);
        expect_byte(8'h34);

        $display("TB: done");
        $finish;
    end
endmodule
