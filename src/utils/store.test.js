import { act, renderHook } from "@testing-library/react-hooks";
import { cleanup } from "@testing-library/react";
import useStore from "./store";

describe("useStore", () => {
    afterEach(() => {
        // You can chose to set the store's state to a default value here.
        jest.resetAllMocks();
        cleanup();
    });

    it("Set snack message", () => {
        const { result } = renderHook(() => useStore((state) => state));

        act(() => {
            result.current.setSnackMessage(["loading"]);
        });

        expect(result.current.snackMessage).toEqual(["loading"]);
    });
});
