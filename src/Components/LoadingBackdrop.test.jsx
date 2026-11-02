import React from 'react'
import {act, render, screen} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import useStore from '../store/useStore'
import LoadingBackdrop from './LoadingBackdrop'


describe('LoadingBackdrop', () => {
  afterEach(() => {
    act(() => {
      useStore.setState({isModelLoading: false, indexedModel: null})
    })
  })

  // MUI's Backdrop keeps its node mounted; `open` shows as visibility.
  const isShown = () => screen.getByTestId('LoadingBackdrop').style.visibility !== 'hidden'

  it('covers the viewer while a model loads', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: null})
    })
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(true)
  })

  // open-205 #2029: from the index on, the tree, properties and search are
  // live while geometry still streams, and a dimmer over them would swallow
  // every click.
  it('lifts once the loading model is indexed', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: {isIndexedModel: true}})
    })
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(false)
  })
})
