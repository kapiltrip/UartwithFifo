`timescale 1ns/1ps

module uart_top_tb;
    reg clk;
    reg reset;
    reg [7:0] data_in;
    reg wr_en;
    reg rdy_clr;

    // Dedicated FIFO stimulus for simple unit-level capacity tests.
    reg fifo_reset;
    reg fifo_wr_en;
    reg [7:0] fifo_wr_data;
    reg fifo_rd_en;
    wire fifo_full;
    wire fifo_empty;
    wire [7:0] fifo_rd_data;

    wire rdy;
    wire busy;
    wire [7:0] data_out;

    integer error_count;
    integer i;

    reg [7:0] burst_data [0:5];

    uart_top #(
        .TX_DIV(16),
        .RX_DIV(1)
    ) dut (
        .clk(clk),
        .reset(reset),
        .data_in(data_in),
        .wr_en(wr_en),
        .rdy_clr(rdy_clr),
        .rdy(rdy),
        .busy(busy),
        .data_out(data_out)
    );

    uart_fifo fifo_unit (
        .clk(clk),
        .reset(fifo_reset),
        .wr_en(fifo_wr_en),
        .wr_data(fifo_wr_data),
        .full(fifo_full),
        .rd_en(fifo_rd_en),
        .rd_data(fifo_rd_data),
        .empty(fifo_empty)
    );

    // Fast simulation clock so complete UART frames appear quickly in the waveform.
    always #1 clk = ~clk;

    task check_value;
        input condition;
        input [8*80-1:0] message;
        begin
            if (!condition) begin
                error_count = error_count + 1;
                $display("FAIL: %0s at %0t", message, $time);
            end
        end
    endtask

    task pulse_reset;
        begin
            @(negedge clk);
            reset = 1'b1;
            @(negedge clk);
            reset = 1'b0;
            repeat (2) @(negedge clk);
        end
    endtask

    task send_byte;
        input [7:0] d;
        begin
            @(negedge clk);
            data_in = d;
            wr_en = 1'b1;
            @(negedge clk);
            wr_en = 1'b0;
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

    task pop_expect_byte;
        input [7:0] exp;
        begin
            wait (rdy == 1'b1);
            if (data_out !== exp) begin
                error_count = error_count + 1;
                $display("FAIL: expected RX byte %02h, got %02h at %0t", exp, data_out, $time);
            end
            clear_ready();
        end
    endtask

    task fifo_write;
        input [7:0] d;
        begin
            @(negedge clk);
            fifo_wr_data = d;
            fifo_wr_en = 1'b1;
            @(negedge clk);
            fifo_wr_en = 1'b0;
        end
    endtask

    task fifo_pop_expect;
        input [7:0] exp;
        begin
            @(negedge clk);
            if (fifo_rd_data !== exp) begin
                error_count = error_count + 1;
                $display("FAIL: expected FIFO byte %02h, got %02h at %0t", exp, fifo_rd_data, $time);
            end
            fifo_rd_en = 1'b1;
            @(negedge clk);
            fifo_rd_en = 1'b0;
        end
    endtask

    initial begin
        $timeformat(-9, 0, " ns", 8);
        clk = 1'b0;
        reset = 1'b1;
        data_in = 8'd0;
        wr_en = 1'b0;
        rdy_clr = 1'b0;

        fifo_reset = 1'b1;
        fifo_wr_en = 1'b0;
        fifo_wr_data = 8'd0;
        fifo_rd_en = 1'b0;

        error_count = 0;
        burst_data[0] = 8'h11;
        burst_data[1] = 8'h22;
        burst_data[2] = 8'h33;
        burst_data[3] = 8'h44;
        burst_data[4] = 8'h77;
        burst_data[5] = 8'h88;

        repeat (3) @(negedge clk);
        reset = 1'b0;
        fifo_reset = 1'b0;
        repeat (2) @(negedge clk);

        // TC01: reset and idle outputs.
        check_value(busy === 1'b0, "TC01 transmitter idle after reset");
        check_value(rdy === 1'b0, "TC01 RX FIFO empty after reset");
        check_value(dut.tx_line === 1'b1, "TC01 serial line idle high");
        check_value(dut.tx_fifo_empty === 1'b1, "TC01 TX FIFO empty after reset");
        check_value(dut.rx_fifo_empty === 1'b1, "TC01 RX FIFO empty flag after reset");
        $display("TEST_CASE TC01 PASS reset and idle checks at %0t", $time);

        // TC02-TC05: basic data patterns exercise ordinary and edge bit values.
        send_byte(8'hA5);
        pop_expect_byte(8'hA5);
        $display("TEST_CASE TC02 PASS single byte A5 at %0t", $time);

        send_byte(8'h00);
        pop_expect_byte(8'h00);
        $display("TEST_CASE TC03 PASS all-zero byte at %0t", $time);

        send_byte(8'hFF);
        pop_expect_byte(8'hFF);
        $display("TEST_CASE TC04 PASS all-one byte at %0t", $time);

        send_byte(8'h55);
        pop_expect_byte(8'h55);
        send_byte(8'hAA);
        pop_expect_byte(8'hAA);
        $display("TEST_CASE TC05 PASS alternating patterns at %0t", $time);

        // TC06: queue a burst while TX is busy; the TX FIFO must preserve order.
        for (i = 0; i < 6; i = i + 1) begin
            send_byte(burst_data[i]);
        end
        wait (dut.rx_fifo.count == 5'd6);
        check_value(dut.tx_fifo_empty === 1'b1, "TC06 TX FIFO drains after burst");
        $display("TEST_CASE TC06 PASS TX FIFO accepted six-byte burst at %0t", $time);

        // TC07: do not read during reception; RX FIFO must hold all six bytes.
        check_value(rdy === 1'b1, "TC07 ready stays high while RX FIFO has data");
        check_value(data_out === 8'h11, "TC07 RX FIFO front is first burst byte");
        repeat (8) @(negedge clk);
        check_value(data_out === 8'h11, "TC07 front byte remains stable until pop");
        for (i = 0; i < 6; i = i + 1) begin
            pop_expect_byte(burst_data[i]);
        end
        repeat (2) @(negedge clk);
        check_value(rdy === 1'b0, "TC07 ready clears after last RX FIFO pop");
        check_value(dut.rx_fifo_empty === 1'b1, "TC07 RX FIFO empty after ordered reads");
        $display("TEST_CASE TC07 PASS RX FIFO hold and ordered reads at %0t", $time);

        // TC08: reset during an active transfer flushes both FIFOs and FSM state.
        send_byte(8'hC3);
        send_byte(8'h5A);
        wait (busy === 1'b1);
        pulse_reset();
        check_value(busy === 1'b0, "TC08 transmitter stops on reset");
        check_value(rdy === 1'b0, "TC08 receiver queue cleared on reset");
        check_value(dut.tx_fifo_empty === 1'b1, "TC08 TX FIFO cleared on reset");
        check_value(dut.rx_fifo_empty === 1'b1, "TC08 RX FIFO cleared on reset");
        check_value(dut.tx_line === 1'b1, "TC08 line returns to idle high");
        $display("TEST_CASE TC08 PASS reset flush during transfer at %0t", $time);

        // TC09: confirm normal communication resumes after reset.
        send_byte(8'h3C);
        pop_expect_byte(8'h3C);
        $display("TEST_CASE TC09 PASS post-reset recovery at %0t", $time);

        // TC10: fill a standalone FIFO to 16 entries and verify overflow is ignored.
        for (i = 0; i < 16; i = i + 1) begin
            fifo_write(i[7:0]);
        end
        check_value(fifo_full === 1'b1, "TC10 FIFO full at depth 16");
        fifo_write(8'hEE);
        check_value(fifo_unit.count === 5'd16, "TC10 write while full is ignored");
        for (i = 0; i < 16; i = i + 1) begin
            fifo_pop_expect(i[7:0]);
        end
        check_value(fifo_empty === 1'b1, "TC10 FIFO empty after 16 reads");
        $display("TEST_CASE TC10 PASS FIFO full and overflow protection at %0t", $time);

        // TC11: simultaneous read/write keeps occupancy constant and replaces data.
        fifo_write(8'h5C);
        @(negedge clk);
        check_value(fifo_rd_data === 8'h5C, "TC11 initial FIFO front value");
        fifo_wr_data = 8'hD2;
        fifo_wr_en = 1'b1;
        fifo_rd_en = 1'b1;
        @(negedge clk);
        fifo_wr_en = 1'b0;
        fifo_rd_en = 1'b0;
        check_value(fifo_unit.count === 5'd1, "TC11 simultaneous read/write keeps count");
        check_value(fifo_rd_data === 8'hD2, "TC11 new byte becomes FIFO front");
        fifo_pop_expect(8'hD2);
        $display("TEST_CASE TC11 PASS simultaneous FIFO read and write at %0t", $time);

        // TC12: prior full-cycle pointer wrap did not damage reuse.
        fifo_write(8'h9B);
        fifo_pop_expect(8'h9B);
        check_value(fifo_empty === 1'b1, "TC12 FIFO reusable after pointer wrap");
        $display("TEST_CASE TC12 PASS FIFO wrap-around reuse at %0t", $time);

        if (error_count == 0) begin
            $display("UART_FIFO_VERIFICATION_PASS: all 12 test cases passed at %0t", $time);
            $finish;
        end else begin
            $display("UART_FIFO_VERIFICATION_FAIL: %0d errors at %0t", error_count, $time);
            $fatal(1, "UART/FIFO verification failed");
        end
    end

    initial begin
        #20000;
        $fatal(1, "Simulation timeout");
    end
endmodule
